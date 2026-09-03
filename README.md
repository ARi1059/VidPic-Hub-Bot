# Telegram 影视 Bot

基于 Telegram Mini App、Bot 原生播放器和私有存储频道的影视、漫画、图集与写真内容系统。

## 当前开发状态

已完成核心业务与生产运行基线：

- pnpm TypeScript Monorepo。
- React Mini App 与 Telegram 内管理台。
- NestJS + Fastify API 身份、目录、收藏、阅读历史、推荐与排行榜接口。
- grammY + BullMQ 受保护视频分发 Worker。
- PostgreSQL Drizzle Schema、Telegram `initData` 校验与三态会员权限。
- Docker Compose、Caddy、PostgreSQL 和 Redis 部署拓扑。
- Telegram webhook 自动注册、API/Bot Worker 就绪检查、Redis 限流和优雅停机。
- 数据库迁移启动门、非 root 应用容器、只读文件系统和最小公网端口。
- PostgreSQL 备份、隔离恢复验证、生产预检与运行手册。
- GitHub Actions 质量/容器构建门和 Dependabot 周期更新。
- PhotoSwipe 图集、漫画滚动/分页阅读、单双页布局、LTR/RTL 与进度恢复。

Mini App 默认连接真实 API；设置 `VITE_ENABLE_MOCKS=true` 可使用完整本地模拟数据进行界面、阅读和视频发送流程验收。图片用户接口仅返回短时签名的浏览版与缩略图，源文件不进入用户端载荷。视频任务通过 BullMQ 排队，由 Bot 使用 `copyMessage + protect_content` 发送到用户私聊并交给 Telegram 原生播放器播放。

## 环境要求

- Node.js 22 或更高版本
- pnpm 9.15
- PostgreSQL 17
- Redis 8

## 本地启动

1. 从 `.env.example` 创建 `.env`，填入测试 Bot、私有频道和本地密钥。
2. 安装依赖：`pnpm install`。
3. 生成数据库迁移：`pnpm db:generate`。
4. 执行数据库迁移：`pnpm db:migrate`。
5. 启动 Mini App：`pnpm dev:mini-app`。
6. 启动完整开发环境：`pnpm dev`。

本地地址：

- Mini App：`http://localhost:5173`
- 管理台：`http://localhost:5174`
- API 健康检查：`http://localhost:3000/api/health`
- OpenAPI：`http://localhost:3000/api/docs`

## 质量检查

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 项目文档

- [用户及管理员操作说明](docs/operation-guide.md)
- [产品需求文档](docs/requirements.md)
- [技术开发文档](docs/technical-development.md)
- [验证记录](docs/verification-record.md)
- [生产候选验证记录](docs/production-verification-record.md)
- [生产运行手册](docs/production-runbook.md)

## 部署

生产与 Staging 使用同一拓扑。先预检并备份，再发布：

```bash
ENV_FILE=.env infra/deploy/preflight.sh
ENV_FILE=.env BACKUP_DIR=/secure/backup infra/backup/postgres-backup.sh
RELEASE_TAG=20260904-1200 docker compose --env-file .env -f infra/compose/compose.yml up -d --build
```

生产发布请为镜像设置唯一 `RELEASE_TAG`；回滚使用 `ENV_FILE=.env infra/deploy/rollback-compose.sh <release-tag>`。Compose 会先执行数据库迁移，迁移成功后再启动 API 与 Bot Worker。PostgreSQL、Redis 和 Caddy 使用持久卷。系统不为 Telegram 视频创建本地媒体卷；视频由 Bot 通过 `copyMessage` 复制到用户私聊，并始终启用 `protect_content`。

## 关键约束

- 会员权限按内容单元、分区、作品逐级继承，子级显式设置优先。
- 作品响应使用 `full`、`partial`、`locked` 三态。
- 公开封面必须是独立的 `public_preview` 浏览版或缩略图。
- 图片源文件不通过 Bot 或 Mini App 下发。
- 视频默认选择最高分辨率可用版本，同像素数时选择管理员主版本。
- 视频消息不自动删除。
