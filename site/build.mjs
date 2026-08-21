// Builds a static site from this repo's GitHub issues into dist/.
// Open issues authored by the users listed in config.json are published;
// closing an issue takes the post down on the next build.
import { mkdir, rm, writeFile, readFile, cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, '..', 'dist')
const config = JSON.parse(await readFile(path.join(here, 'config.json'), 'utf8'))

const token = process.env.GITHUB_TOKEN
if (!token) {
  console.error('GITHUB_TOKEN is required (locally: GITHUB_TOKEN=$(gh auth token) node site/build.mjs)')
  process.exit(1)
}

const api = async (url, init = {}) => {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'tech-blog-site-builder',
      ...init.headers,
    },
  })
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${await res.text()}`)
  return res
}

const fetchPosts = async () => {
  const issues = []
  for (let page = 1; ; page++) {
    const res = await api(`https://api.github.com/repos/${config.repo}/issues?state=open&per_page=100&page=${page}`)
    const batch = await res.json()
    if (batch.length === 0) break
    issues.push(...batch)
  }
  return issues
    .filter((issue) => !issue.pull_request && config.authors.includes(issue.user.login))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

const renderMarkdown = async (text) => {
  const res = await api('https://api.github.com/markdown', {
    method: 'POST',
    body: JSON.stringify({ text, mode: 'gfm', context: config.repo }),
  })
  return res.text()
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const langOf = (s) => (/[一-鿿]/.test(s) ? 'zh-CN' : 'en')
const day = (iso) => iso.slice(0, 10)

const excerpt = (markdown) =>
  (markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*`|_~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)

// Publishing convention: a translated post links to its counterpart in the
// first line of the body. Two posts that link to each other and differ in
// language are treated as one article; the index lists only the Chinese one.
const detectTranslations = (posts) => {
  const byNumber = new Map(posts.map((p) => [p.number, p]))
  const refOf = (post) => {
    const match = (post.body || '')
      .slice(0, 300)
      .match(new RegExp(`github\\.com/${config.repo.replace('/', '\\/')}/issues/(\\d+)`))
    return match ? Number(match[1]) : null
  }
  const pairOf = new Map()
  for (const post of posts) {
    const other = byNumber.get(refOf(post))
    if (other && refOf(other) === post.number && langOf(other.title) !== langOf(post.title)) {
      pairOf.set(post.number, other)
    }
  }
  return pairOf
}

// Cross-references between issues (e.g. 中文版/English version links) should
// stay on the site instead of jumping back to GitHub.
const localizeIssueLinks = (html, published) => {
  const pattern = new RegExp(`href="https://github\\.com/${config.repo.replace('/', '\\/')}/issues/(\\d+)(#[^"]*)?"`, 'g')
  return html.replace(pattern, (match, number, hash) =>
    published.has(Number(number)) ? `href="../${number}/${hash ?? ''}"` : match,
  )
}

const shell = ({ lang, title, description, canonical, root, body }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(canonical)}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="alternate" type="application/atom+xml" title="${esc(config.title)}" href="${root}feed.xml">
<link rel="icon" type="image/png" href="${root}favicon.png">
<link rel="apple-touch-icon" href="${root}favicon.png">
<link rel="stylesheet" href="${root}style.css">
</head>
<body>
${body}
<footer class="site-footer">
<p>© 金数据技术团队 ·
<a href="https://jinshuju.net">jinshuju.net</a> ·
<a href="https://github.com/${config.repo}">GitHub</a> ·
<a href="${root}feed.xml">RSS</a></p>
</footer>
</body>
</html>
`

const metaLine = (post, alt) => {
  const labels = post.labels.map((l) => esc(l.name)).join(' / ')
  const altLink = alt ? ` · <a class="alt-lang" href="${alt.href}">${alt.text}</a>` : ''
  return `<time datetime="${day(post.created_at)}">${day(post.created_at)}</time> · ${esc(post.user.login)}${labels ? ` · <span class="labels">${labels}</span>` : ''}${altLink}`
}

const altTextFor = (counterpart) => (langOf(counterpart.title) === 'zh-CN' ? '中文版' : 'English version')

const isListed = (post, pairOf) => !(pairOf.has(post.number) && langOf(post.title) !== 'zh-CN')

const indexPage = (posts, pairOf) => {
  const listed = posts.filter((post) => isListed(post, pairOf))
  const byYear = new Map()
  for (const post of listed) {
    const year = post.created_at.slice(0, 4)
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year).push(post)
  }
  let i = 0
  const groups = [...byYear.entries()]
    .map(
      ([year, group]) => `<section class="year">
<h2 class="year-label">${year}</h2>
<ol class="entries">
${group
  .map(
    (post) => `<li class="entry" style="--d:${Math.min(i++, 14) * 45}ms">
<span class="no">№${post.number}</span>
<div>
<a class="entry-title" lang="${langOf(post.title)}" href="./posts/${post.number}/">${esc(post.title.trim())}</a>
<p class="meta">${metaLine(post, pairOf.has(post.number) ? { href: `./posts/${pairOf.get(post.number).number}/`, text: altTextFor(pairOf.get(post.number)) } : null)}</p>
</div>
</li>`,
  )
  .join('\n')}
</ol>
</section>`,
    )
    .join('\n')

  const body = `<header class="masthead">
<p class="kicker">Engineering Notes · <a href="https://github.com/${config.repo}/issues">GitHub Issues</a> · <a href="./feed.xml">RSS</a></p>
<h1>${esc(config.title)}</h1>
<p class="subtitle">${esc(config.subtitle)}</p>
</header>
<main>
${groups}
</main>`

  return shell({
    lang: 'zh-CN',
    title: config.title,
    description: config.subtitle,
    canonical: config.url,
    root: './',
    body,
  })
}

const postPage = (post, contentHtml, counterpart) => {
  const title = post.title.trim()
  const alt = counterpart ? { href: `../${counterpart.number}/`, text: altTextFor(counterpart) } : null
  const body = `<article>
<header class="post-header">
<p class="kicker"><a href="../../">${esc(config.title)}</a> · №${post.number}</p>
<h1>${esc(title)}</h1>
<p class="meta">${metaLine(post, alt)}</p>
</header>
<div class="markdown-body">
${contentHtml}
</div>
<footer class="post-footer">
<a href="${esc(post.html_url)}">在 GitHub 上评论 · Comment on GitHub Issue #${post.number} →</a>
</footer>
</article>`

  return shell({
    lang: langOf(title),
    title: `${title} · ${config.title}`,
    description: excerpt(post.body),
    canonical: `${config.url}posts/${post.number}/`,
    root: '../../',
    body,
  })
}

const atomFeed = (posts, rendered, pairOf) => {
  const updated = posts.map((p) => p.updated_at).sort().at(-1) ?? new Date(0).toISOString()
  const entries = posts
    .filter((post) => isListed(post, pairOf))
    .slice(0, 20)
    .map((post) => {
      const url = `${config.url}posts/${post.number}/`
      return `<entry>
<title>${esc(post.title.trim())}</title>
<link href="${esc(url)}"/>
<id>${esc(url)}</id>
<published>${post.created_at}</published>
<updated>${post.updated_at}</updated>
<author><name>${esc(post.user.login)}</name></author>
${post.labels.map((l) => `<category term="${esc(l.name)}"/>`).join('\n')}
<content type="html">${esc(rendered.get(post.number))}</content>
</entry>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>${esc(config.title)}</title>
<subtitle>${esc(config.subtitle)}</subtitle>
<link href="${esc(config.url)}"/>
<link rel="self" href="${esc(config.url)}feed.xml"/>
<id>${esc(config.url)}</id>
<updated>${updated}</updated>
${entries}
</feed>
`
}

const posts = await fetchPosts()
console.log(`Publishing ${posts.length} posts`)

const published = new Set(posts.map((p) => p.number))
// Feed entries keep absolute GitHub links; post pages get site-relative ones.
const rendered = new Map()
for (const post of posts) {
  rendered.set(post.number, await renderMarkdown(post.body || ''))
  console.log(`  rendered #${post.number} ${post.title.trim()}`)
}

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const pairOf = detectTranslations(posts)
await cp(path.join(here, 'style.css'), path.join(outDir, 'style.css'))
await cp(path.join(here, 'favicon.png'), path.join(outDir, 'favicon.png'))
await writeFile(path.join(outDir, 'index.html'), indexPage(posts, pairOf))
await writeFile(path.join(outDir, 'feed.xml'), atomFeed(posts, rendered, pairOf))
for (const post of posts) {
  const dir = path.join(outDir, 'posts', String(post.number))
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'index.html'), postPage(post, localizeIssueLinks(rendered.get(post.number), published), pairOf.get(post.number)))
}
console.log(`Done → ${outDir}`)
