# Jinshuju Tech Blog

Engineering notes from the Jinshuju team.

This repository collects articles and notes about product engineering, developer experience, APIs, automation, and the technical work behind Jinshuju.

## 适合谁阅读

- 对金数据工程实践感兴趣的开发者
- 正在接入金数据 API、Webhook、MCP 或自动化能力的技术同学
- 关注表单、数据流转、系统集成和 AI Agent 工作流的团队

## 文章入口

静态站点（由 Issues 自动构建）：

[https://tech.jinshuju.net/](https://tech.jinshuju.net/)

所有文章发布在本仓库 Issues，评论与讨论也在 Issues 进行：

[https://github.com/jinshuju/tech-blog/issues](https://github.com/jinshuju/tech-blog/issues)

### 静态站点如何工作

- 文章即 Issue：`site/config.json` 中 `authors` 名单内成员创建的 open issue 会被发布；close 即下架
- Issue 的增改、labels 变化、push 到 main 都会触发 [`publish.yml`](./.github/workflows/publish.yml) 重新构建并部署到 GitHub Pages
- 本地预览：`GITHUB_TOKEN=$(gh auth token) node site/build.mjs`，产物在 `dist/`

## 推荐主题

后续文章会优先围绕以下方向整理：

- API、Webhook、MCP 和开放平台实践
- 表单数据流转、自动化和系统集成
- AI Agent 与金数据工作流
- 前端、后端、稳定性和工程效率
- 产品工程中的经验复盘

## 维护状态

本仓库由金数据技术团队维护，主要用于发布技术文章和工程实践记录。暂不作为产品支持或安全问题反馈渠道；产品支持请访问帮助中心，安全问题请联系 support@jinshuju.net。

## 关于金数据

金数据官网：[https://jinshuju.net](https://jinshuju.net)

金数据开放平台：[https://open.jinshuju.net](https://open.jinshuju.net)

金数据帮助中心：[https://help.jinshuju.net](https://help.jinshuju.net)
