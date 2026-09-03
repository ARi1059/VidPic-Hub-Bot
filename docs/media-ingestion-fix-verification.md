# 媒体入库与封面功能修复验证记录

验证日期：2026-09-03  
代码提交：`7eccf70 fix: restore media ingestion workflow`

## 1. 问题基线

线上只读查询：

```text
works|ingestion|assets
1|0|0
```

管理台已有作品，但不存在待入库记录或媒体资源，因此没有封面和媒体可供关联。Bot API 检查确认 Bot 可访问配置的私有存储频道、身份为管理员、使用长轮询且未配置 webhook。

## 2. 修复内容

- 待入库页面增加上传说明、空状态和刷新操作。
- 明确文件通过 Telegram 私有存储频道上传，管理台不直接接收媒体文件。
- 新增 `POST /api/admin/media-assets/:mediaId/promote-cover`。
- 只有同一作品下可用的 `public_preview` `browse` 或 `thumbnail` 图片可以提升为独立作品级封面。
- 提升操作复制媒体元数据，不修改正文媒体归属和权限，并写入管理员审计日志。
- Bot 成功登记私有频道媒体后写入不含文件 ID 的结构化日志。

## 3. 本地验证

```text
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && git diff --check
```

退出状态：`0`。测试共 `23` 项通过，所有工作区项目完成类型检查和生产构建。

## 4. 线上验证

发布目录（线上变量 `RELEASE_DIR`）：

```text
RELEASE_DIR
```

API 健康响应：

```text
{"data":{"status":"ok","service":"api","timestamp":"2026-09-03T13:07:25.152Z"},"requestId":"9759ccb6-4ed6-49f8-b28c-b81e8027f234"}
```

未携带管理会话访问管理接口返回 `401`，新增 `promote-cover` 路由在启动日志中完成注册。API、Bot Worker、Nginx、PostgreSQL、Redis 均为 `active`。

当前发布指针：

```text
CURRENT_LINK -> RELEASE_DIR
```

## 5. 回滚

```text
${RELEASE_DIR}/rollback-release.sh 20260903-admin-session-fix
```

脚本会原子切换发布指针，重启 API 和 Bot Worker，重载 Nginx，并等待 API 健康检查通过。

## 6. 现场验收步骤

1. 使用 Telegram 客户端向已配置的私有存储频道重新发送一张新图片。
2. 从 Bot `/admin` 入口打开管理台，在“待入库”点击“刷新列表”。
3. 将图片关联为作品级资源并勾选“设为作品独立公开封面”，或关联后设为可用公开预览图片再点击“设为封面”。
4. 重新发送视频，在待入库关联到目标内容单元并设为可用。

Bot 加入频道前的历史消息不会自动回补，必须重新发送。
