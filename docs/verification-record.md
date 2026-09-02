# 文档 1.3 交付验证记录

## 1. 验证对象

- 产品需求文档：`docs/requirements.md` 1.3
- 技术开发文档：`docs/technical-development.md` 1.3
- 1.2 到 1.3 更新补丁：`docs/documentation.patch`
- 1.3 到 1.2 回滚脚本：`scripts/rollback-documentation.sh`
- 1.2 原文和交付物归档：`docs/archive/`

验证日期：2026-09-02

## 2. 1.2 基线

```text
fa05c760e09c18a04b1e54eb59d163546f3fb79f067866fc51381b0e76b387b5  docs/archive/requirements-v1.2.md
d3c850b6d9d4cd108b7584dcdb41003f6d1a4deb2f7fb9650d9eacb7f5876c2c  docs/archive/technical-development-v1.2.md
```

1.2 的补丁、验证记录和回滚脚本已分别归档：

```text
docs/archive/documentation-v1.2.patch
docs/archive/verification-record-v1.2.md
docs/archive/rollback-documentation-v1.2.sh
```

## 3. 本次修正

1. 权限响应改为 `full`、`partial`、`locked` 三态，先计算已发布子级权限，再决定作品状态。
2. 作品为 `member` 时，显式 `public` 子级正常覆盖父级；全部子级公开时返回 `full`，公开与会员混合时返回 `partial`。
3. `works` 使用独立 `public_cover_asset_id`；封面只能引用 `public_preview` 范围的 `browse` 或 `thumbnail`。
4. 新增 `membership_cta_tokens` 和 `membership_conversion_events`，定义用户绑定、7 天有效期、幂等入口事件和最近 30 天激活归因。
5. Bot、管理员会员服务、数据保留、测试矩阵、风险、ADR 和开发基线均已同步。

## 4. 文件摘要

命令：

```text
shasum -a 256 docs/requirements.md docs/technical-development.md docs/documentation.patch scripts/rollback-documentation.sh
```

输出：

```text
59dfa6ac775fe20a5de8f73a4b097ff37f2f9283a822efe5ead3c545964a2a7d  docs/requirements.md
e2233db3625dbb5e15f8b76c91aa0be4676348362ecba781b3a4d1776dd76db0  docs/technical-development.md
5a4bc21ad9bf97cfd6a966a013919e39f461c3fb97f87ad0ce7f96f920ae1e3d  docs/documentation.patch
d0e85f55457f5fece8ce684fa69469d76488f030527bf1102f30854c9b54304f  scripts/rollback-documentation.sh
```

退出状态：`0`

## 5. 文件类型与结构

```text
docs/requirements.md:              Unicode text, UTF-8 text
docs/technical-development.md:     Unicode text, UTF-8 text
docs/documentation.patch:          unified diff output text, Unicode text, UTF-8 text
scripts/rollback-documentation.sh: POSIX shell script text executable, ASCII text
```

行数：

```text
613 docs/requirements.md
1108 docs/technical-development.md
357 docs/documentation.patch
70 scripts/rollback-documentation.sh
2148 total
```

文件类型和行数检查退出状态均为 `0`。

Markdown 围栏检查：

```text
docs/requirements.md fenced_markers=2
docs/technical-development.md fenced_markers=8
```

围栏检查退出状态均为 `0`。

尾随空格及遗留标记检查：

```text
rg -n ' +$|TODO|TBD|FIXME' docs/requirements.md docs/technical-development.md
```

输出为空，退出状态：`1`，表示没有匹配项。

旧问题表述检查：

```text
rg -n '当普通用户访问锁定会员作品时.*不查询|名称、别名、简介、封面资源 ID|单独标记为公开展示|membership_cta.*短来源标识用于统计|阶段 2 所需的三级权限字段、继承算法、锁定作品' docs/requirements.md docs/technical-development.md
```

输出为空，退出状态：`1`，表示旧权限短路、模糊封面字段和未闭环转化表述均已移除。

## 6. 更新补丁验证

输入：归档的 1.2 产品需求文档和技术开发文档。

执行：

```text
patch -d /private/tmp/film-bot-doc-v13-patch.8caxGQ -p0 -i /Users/macbook/Documents/影视机器人/docs/documentation.patch
diff -q /private/tmp/film-bot-doc-v13-patch.8caxGQ/docs/requirements.md docs/requirements.md
diff -q /private/tmp/film-bot-doc-v13-patch.8caxGQ/docs/technical-development.md docs/technical-development.md
```

补丁输出：

```text
patching file 'docs/requirements.md'
patching file 'docs/technical-development.md'
```

补丁退出状态：`0`。两次 `diff -q` 输出为空，退出状态均为 `0`，表示补丁结果与工作区 1.3 文档逐字一致。

## 7. 回滚验证

只读检查：

```text
scripts/rollback-documentation.sh --check
```

输出：

```text
rollback check passed: /Users/macbook/Documents/影视机器人
```

退出状态：`0`

在 1.3 临时副本执行：

```text
/private/tmp/film-bot-doc-v13-rollback.Wt6hPN/scripts/rollback-documentation.sh /private/tmp/film-bot-doc-v13-rollback.Wt6hPN
```

输出：

```text
patching file 'docs/requirements.md'
patching file 'docs/technical-development.md'
documentation rollback completed: 1.3 -> 1.2 at /private/tmp/film-bot-doc-v13-rollback.Wt6hPN
```

退出状态：`0`

回滚后逐文件对比 1.2 归档：

```text
requirements.md              diff exit 0
technical-development.md     diff exit 0
documentation.patch          diff exit 0
verification-record.md       diff exit 0
rollback-documentation.sh    diff exit 0
```

## 8. 最终结果

- 产品需求文档 1.3：通过。
- 技术开发文档 1.3：通过。
- 1.2 到 1.3 补丁：通过。
- 1.3 到 1.2 回滚：通过。
- 三态权限、公开封面和会员转化归因一致性：通过。
- 开发状态：`GO`。
