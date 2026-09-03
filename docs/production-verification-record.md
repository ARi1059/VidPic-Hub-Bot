# 生产候选工程验证记录

## 1. 验证范围

- 产品需求基线：`docs/requirements.md` 1.3
- 技术开发基线：`docs/technical-development.md` 1.3
- 生产运行手册：`docs/production-runbook.md`
- Compose、Caddy、Docker 运行配置
- API 限流、就绪探针、图片代理和 Bot Webhook/Polling 生命周期

验证日期：2026-09-04

## 2. 本轮生产化变更

1. API 增加 PostgreSQL/Redis 就绪检查、请求 ID、分级 Redis 限流和生产 HTTPS 配置校验。
2. 身份验证和管理员接口在 Redis 保护服务不可用时 fail-closed；公开读取流量在短暂 Redis 故障时保持可用，并由 readiness 反映依赖异常。
3. 图片代理增加 MIME 白名单、Telegram 上游超时、响应大小上限、流式字节限制和异常清理。
4. Bot 启动时注册并核验 Webhook，Polling 模式清理旧 Webhook；增加 Bot Worker readiness 和幂等优雅停机。
5. Caddy 分离 Mini App、管理台、API 和 `/telegram/webhook` 路由；管理台继续使用 `/admin/` 资源前缀。
6. Compose 增加迁移启动门、健康检查、只读文件系统、tmpfs、`no-new-privileges` 和非 root 应用容器。
7. 增加发布预检、PostgreSQL 备份、隔离恢复验证和按镜像标签回滚脚本。
8. 用户会话有效期改为生产可配置项，默认 1 小时；增加 GitHub Actions 质量、依赖审计和四类容器构建门。

## 3. 自动化验证

```text
pnpm format:check                         exit 0
pnpm lint                                 exit 0
pnpm typecheck                            exit 0
pnpm test                                 exit 0
pnpm build                                exit 0
sh -n infra/backup/*.sh infra/deploy/*.sh exit 0
ruby YAML.load infra/compose/compose.yml  exit 0
git diff --check                          exit 0
```

测试统计：`packages/config` 3、`packages/contracts` 17、`packages/telegram` 3、`apps/api` 8，总计 31 tests passed。

## 4. 静态部署验证

```text
static_production_checks=passed
compose_yaml=passed
admin_dist=/admin/assets/*
caddy_webhook_route=present
caddy_admin_api_route=present
compose_migration_gate=present
non_root_runtime_users=api,bot-worker,migrate
backup_restore_preflight_scripts=executable
```

当前开发环境没有 Docker CLI，因此未在本机执行镜像构建、Compose 启动、容器 healthcheck、Caddy 语法命令和真实 Telegram API 调用。这些必须在 Staging/VPS 执行。

## 5. Staging 发布验证清单

1. 使用独立测试 Bot、测试频道和测试数据库执行 `infra/deploy/preflight.sh`。
2. 使用唯一 `RELEASE_TAG` 构建并启动 Compose，确认 `migrate` 成功后 API/Bot Worker 才进入 healthy。
3. 检查 `/api/health/ready`、Bot Worker `/health/ready` 和 Caddy HTTPS 证书。
4. 验证管理员 `/admin/` 资源、Mini App 身份验证、频道入库、图片 browse/thumbnail 浏览和公开封面。
5. 验证视频 `copyMessage + protect_content`、最高分辨率选择、Bot `/start`、Webhook 重试和消息按钮。
6. 使用历史验证过的 4GB 视频执行当前环境冒烟；失败则阻断该环境发布并记录 Telegram 返回信息。
7. 执行容量、备份恢复和 15 分钟稳定性观察，保存 P95、错误率、队列和资源水位。

## 6. 结论

代码与本地自动化验证达到生产候选标准，业务范围仍按 MVP 产品边界运行。上线状态为 `STAGING_REQUIRED`：完成真实 Docker、VPS、HTTPS、Telegram、容量和恢复演练后，才可将生产状态标记为 `GO`。
