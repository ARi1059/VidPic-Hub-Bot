# 生产运行手册

## 1. 发布门槛

发布前必须同时满足：代码质量检查全部通过；生产配置预检通过；PostgreSQL 备份成功并复制到 VPS 之外；Staging 完成 Telegram 身份验证、频道入库、图片浏览、受保护视频发送和 4GB 视频冒烟；API 与 Bot Worker 就绪检查均为绿色。

`main` 分支发布还要求 GitHub Actions 的 `quality` 与 `containers` 两个任务通过。`quality` 包含格式、Lint、类型、测试、构建和高危依赖审计；`containers` 验证 Compose 并构建 API、Bot Worker、迁移和 Web 镜像。

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
ENV_FILE=.env infra/deploy/preflight.sh
```

## 2. 发布顺序

1. 执行数据库备份：`ENV_FILE=.env BACKUP_DIR=/secure/backup infra/backup/postgres-backup.sh`。
2. 使用唯一发布标签构建镜像：`RELEASE_TAG=20260904-1200 docker compose --env-file .env -f infra/compose/compose.yml build`。
3. 启动同一标签：`RELEASE_TAG=20260904-1200 docker compose --env-file .env -f infra/compose/compose.yml up -d`。`migrate` 服务完成迁移后，API 和 Bot Worker 才会启动。
4. 检查 API `/api/health/ready` 与 Bot Worker 容器 `/health/ready`，必须返回 `status=ok`。
5. 执行业务冒烟：用户和管理员登录、作品列表、图片浏览、视频发送、Bot `/start`、频道新媒体入库。
6. 观察至少 15 分钟；容器重启、5xx、Telegram 429、队列堆积、PostgreSQL/Redis 状态均无异常后完成发布。

生产环境强制 HTTPS 与 Telegram webhook。Caddy 只向公网开放 80/443；PostgreSQL、Redis、API 和 Bot Worker 不发布宿主机端口。生产环境不提供 OpenAPI 页面。

## 3. 回滚

应用回滚使用上一份已验证镜像标签执行 `ENV_FILE=.env infra/deploy/rollback-compose.sh <release-tag>`。回滚脚本会重新启动该标签的 API、Bot Worker、迁移服务和 Web，并直接检查两个就绪端点。数据库迁移必须向前兼容：先发布兼容旧代码的扩展性迁移，完成应用切换后再在后续版本清理旧字段。涉及破坏性迁移时，应停止写流量并先将发布前备份恢复到隔离数据库验证，不直接覆盖现有生产库。

回滚后重新检查两个就绪端点和业务冒烟。`infra/deploy/rollback-release.sh` 属于旧 systemd/nginx 部署方式，不用于当前 Compose 拓扑。

## 4. 备份与恢复

- 每日执行 `infra/backup/postgres-backup.sh`，默认保留 14 天，可通过 `BACKUP_RETENTION_DAYS` 调整。
- `.dump` 和 `.sha256` 必须同步至 VPS 之外的加密存储；VPS 本地副本不计入 RPO 保证。
- 每季度使用 `infra/backup/postgres-restore-verify.sh <backup.dump>` 完成一次隔离恢复演练，并记录耗时与表数量。
- Redis AOF 只用于队列恢复，PostgreSQL 是业务事实源；Telegram 媒体文件不进入 VPS 备份。

## 5. 监控与告警

至少监控：API 和 Bot Worker 就绪状态、容器重启次数、API 5xx 与 P95、图片代理错误与上游耗时、BullMQ 等待/失败数、Telegram 429/403、PostgreSQL 连接与磁盘、Redis 内存和 AOF、TLS 到期时间、备份新鲜度。

告警建议：就绪连续失败 2 分钟；5 分钟 5xx 超过 1%；队列持续增长 10 分钟；磁盘超过 80%；最近成功备份超过 26 小时；证书剩余不足 14 天。日志禁止记录 Bot Token、完整 Authorization、完整 Telegram `initData` 和图片签名查询串。

## 6. 容量与扩展

图片代理是主要带宽和连接消耗点；当 CPU 持续超过 75%、内存超过 80% 或图片首字节 P95 超过 1.5 秒时，先扩容至至少 4 vCPU / 8GB，再考虑拆分 PostgreSQL、Redis 或图片代理。视频继续由 Telegram 原生播放器承载，不在 VPS 永久存储或代理。
