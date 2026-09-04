import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  LayoutDashboard,
  Library,
  ListOrdered,
  LoaderCircle,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import {
  adminApi,
  AdminApiError,
  type AdminProfile,
  type AdminUser,
  type AdminWork,
  type ArchiveSortRule,
  type ArchiveSortRuleInput,
  type AuditLog,
  type IngestionItem,
  type PublicationStatus,
  type SystemSettings,
  type WorkType,
} from "./api.js";
import { IngestionDrawer, WorkEditor } from "./editors.js";

type Page =
  "概览" | "作品" | "待入库" | "图片排序规则" | "用户与会员" | "审计日志" | "系统设置" | "操作说明";
type StatusFilter = "all" | PublicationStatus;

const navigation: Array<{ label: Page; icon: typeof LayoutDashboard }> = [
  { label: "概览", icon: LayoutDashboard },
  { label: "作品", icon: Library },
  { label: "待入库", icon: Archive },
  { label: "图片排序规则", icon: ListOrdered },
  { label: "用户与会员", icon: Users },
  { label: "审计日志", icon: ShieldCheck },
  { label: "系统设置", icon: Settings },
  { label: "操作说明", icon: CircleHelp },
];

export const workTypeLabels: Record<WorkType, string> = {
  video: "影视",
  comic: "漫画",
  gallery: "图集",
  photoshoot: "写真",
};

export const publicationLabels: Record<PublicationStatus, string> = {
  draft: "草稿",
  published: "已发布",
  withdrawn: "已下架",
};

export function App() {
  const [activePage, setActivePage] = useState<Page>("作品");
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [works, setWorks] = useState<AdminWork[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [ingestion, setIngestion] = useState<IngestionItem[]>([]);
  const [archiveRules, setArchiveRules] = useState<ArchiveSortRule[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [editorWorkId, setEditorWorkId] = useState<string | null | undefined>(undefined);
  const [attachItem, setAttachItem] = useState<IngestionItem | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        nextProfile,
        nextWorks,
        nextSettings,
        nextUsers,
        nextIngestion,
        nextArchiveRules,
        nextLogs,
      ] = await Promise.all([
        adminApi.initialize(),
        adminApi.listWorks(),
        adminApi.getSettings(),
        adminApi.listUsers(),
        adminApi.listIngestion(),
        adminApi.listArchiveSortRules(),
        adminApi.listAuditLogs(),
      ]);
      setProfile(nextProfile);
      setWorks(nextWorks);
      setSettings(nextSettings);
      setUsers(nextUsers);
      setIngestion(nextIngestion);
      setArchiveRules(nextArchiveRules);
      setAuditLogs(nextLogs);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    window.Telegram?.WebApp?.ready?.();
    window.Telegram?.WebApp?.expand?.();
    void loadData();
  }, []);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const refreshWorks = async () => setWorks(await adminApi.listWorks());
  const refreshIngestion = async () => setIngestion(await adminApi.listIngestion());
  const refreshArchiveRules = async () => setArchiveRules(await adminApi.listArchiveSortRules());
  const refreshAudit = async () => setAuditLogs(await adminApi.listAuditLogs());

  const handleMembershipSetting = async () => {
    if (!settings) return;
    try {
      const updated = await adminApi.setMembershipEnabled(!settings.membershipEnabled);
      setSettings(updated);
      notify(updated.membershipEnabled ? "会员权限已开启" : "会员权限已关闭");
      await refreshAudit();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  let content: React.ReactNode;
  if (loading) {
    content = <LoadingState />;
  } else if (error && !profile) {
    content = <ErrorState message={error} onRetry={() => void loadData()} />;
  } else {
    content = (
      <>
        {error && (
          <div className="page-alert" role="alert">
            <CircleAlert size={17} />
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="关闭错误提示">
              <X size={16} />
            </button>
          </div>
        )}
        {activePage === "概览" && (
          <OverviewPage works={works} ingestion={ingestion} users={users} logs={auditLogs} />
        )}
        {activePage === "作品" && (
          <WorksPage
            works={works}
            onCreate={() => setEditorWorkId(null)}
            onEdit={(workId) => setEditorWorkId(workId)}
          />
        )}
        {activePage === "待入库" && (
          <IngestionPage items={ingestion} onAttach={setAttachItem} onRefresh={refreshIngestion} />
        )}
        {activePage === "图片排序规则" && (
          <ArchiveSortRulesPage
            rules={archiveRules}
            onCreate={async (input) => {
              await adminApi.createArchiveSortRule(input);
              await Promise.all([refreshArchiveRules(), refreshAudit()]);
              notify("图片排序规则已新增");
            }}
            onDelete={async (ruleId) => {
              await adminApi.deleteArchiveSortRule(ruleId);
              await Promise.all([refreshArchiveRules(), refreshAudit()]);
              notify("图片排序规则已删除");
            }}
          />
        )}
        {activePage === "用户与会员" && (
          <UsersPage
            users={users}
            onChange={async (user, active, expiresAt) => {
              try {
                const updated = await adminApi.updateUserMembership(user.id, active, expiresAt);
                setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
                notify(active ? "会员权限已生效" : "会员权限已关闭");
                await refreshAudit();
              } catch (caught) {
                setError(errorMessage(caught));
              }
            }}
          />
        )}
        {activePage === "审计日志" && <AuditPage logs={auditLogs} />}
        {activePage === "系统设置" && settings && (
          <SettingsPage settings={settings} onToggle={() => void handleMembershipSetting()} />
        )}
        {activePage === "操作说明" && <GuidePage />}
      </>
    );
  }

  return (
    <div className="admin-shell">
      <aside className={mobileMenuOpen ? "sidebar open" : "sidebar"}>
        <div className="admin-brand">
          <span>FL</span>
          <div>
            <strong>片库管理台</strong>
            <small>{adminApi.isMock ? "MOCK PREVIEW" : "TELEGRAM ADMIN"}</small>
          </div>
        </div>
        <nav>
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={activePage === label ? "active" : ""}
              type="button"
              onClick={() => {
                setActivePage(label);
                setMobileMenuOpen(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === "待入库" && pendingCount(ingestion) > 0 && (
                <em>{pendingCount(ingestion)}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="admin-account">
          <span>{initial(profile?.displayName)}</span>
          <div>
            <strong>{profile?.displayName ?? "管理员"}</strong>
            <small>{adminApi.isMock ? "本地模拟数据" : "发布权限已校验"}</small>
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button
          className="nav-backdrop"
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="关闭导航"
        />
      )}

      <main className="workspace">
        <header className="workspace-header">
          <button
            className="mobile-menu icon-command"
            type="button"
            onClick={() => setMobileMenuOpen((value) => !value)}
            aria-label="打开导航"
          >
            <Menu size={21} />
          </button>
          <div>
            <span>内容运营</span>
            <h1>{activePage}</h1>
          </div>
          <div className="header-actions">
            <button
              className="icon-command"
              type="button"
              onClick={() => void loadData()}
              aria-label="刷新数据"
              title="刷新数据"
            >
              <RefreshCw size={17} />
            </button>
            {(activePage === "作品" || activePage === "概览") && (
              <button className="create-button" type="button" onClick={() => setEditorWorkId(null)}>
                <Plus size={17} />
                <span>新建作品</span>
              </button>
            )}
          </div>
        </header>
        {content}
      </main>

      {editorWorkId !== undefined && (
        <WorkEditor
          workId={editorWorkId}
          onClose={() => setEditorWorkId(undefined)}
          onSaved={async (message) => {
            await Promise.all([refreshWorks(), refreshAudit()]);
            notify(message);
          }}
        />
      )}

      {attachItem && (
        <IngestionDrawer
          item={attachItem}
          works={works}
          archiveRules={archiveRules}
          onClose={() => setAttachItem(null)}
          onAttached={async () => {
            await Promise.all([refreshIngestion(), refreshWorks(), refreshAudit()]);
            setAttachItem(null);
            notify("媒体已关联，当前状态为待确认");
          }}
        />
      )}

      {toast && (
        <div className="status-toast" role="status">
          <CircleCheck size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

function OverviewPage({
  works,
  ingestion,
  users,
  logs,
}: {
  works: AdminWork[];
  ingestion: IngestionItem[];
  users: AdminUser[];
  logs: AuditLog[];
}) {
  return (
    <div className="page-stack">
      <Metrics
        values={[
          {
            label: "作品总数",
            value: works.length,
            detail: `${works.filter((work) => work.publicationStatus === "published").length} 部已发布`,
            icon: Library,
          },
          {
            label: "待入库媒体",
            value: pendingCount(ingestion),
            detail: "来自私有存储频道",
            icon: Archive,
          },
          {
            label: "有效会员",
            value: users.filter(membershipValid).length,
            detail: `${users.length} 位已登录用户`,
            icon: Users,
          },
          { label: "近期操作", value: logs.length, detail: "保留请求追踪号", icon: Activity },
        ]}
      />
      <section className="split-section">
        <div className="plain-panel">
          <SectionHeading title="最近更新作品" detail="按更新时间排序" />
          <div className="compact-list">
            {works.slice(0, 5).map((work) => (
              <div key={work.id}>
                <span className="type-icon">{workTypeLabels[work.type].slice(0, 1)}</span>
                <div>
                  <strong>{work.title}</strong>
                  <small>{formatDateTime(work.updatedAt)}</small>
                </div>
                <StatusPill status={work.publicationStatus} />
              </div>
            ))}
          </div>
        </div>
        <div className="plain-panel">
          <SectionHeading title="最近审计" detail="管理员写操作" />
          <div className="compact-list audit-compact">
            {logs.slice(0, 5).map((log) => (
              <div key={log.id}>
                <ShieldCheck size={16} />
                <div>
                  <strong>{actionLabel(log.action)}</strong>
                  <small>
                    {shortId(log.requestId)} · {formatDateTime(log.createdAt)}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function WorksPage({
  works,
  onCreate,
  onEdit,
}: {
  works: AdminWork[];
  onCreate(): void;
  onEdit(workId: string): void;
}) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return works.filter(
      (work) =>
        (status === "all" || work.publicationStatus === status) &&
        (!needle ||
          work.title.toLocaleLowerCase().includes(needle) ||
          work.tags.some((tag) => tag.toLocaleLowerCase().includes(needle))),
    );
  }, [query, status, works]);

  return (
    <div className="page-stack">
      <Metrics
        values={[
          { label: "全部作品", value: works.length, detail: "当前内容库", icon: Library },
          {
            label: "已发布",
            value: works.filter((item) => item.publicationStatus === "published").length,
            detail: "用户可发现",
            icon: CircleCheck,
          },
          {
            label: "待完善草稿",
            value: works.filter((item) => item.publicationStatus === "draft").length,
            detail: "发布前需校验",
            icon: Activity,
          },
          {
            label: "会员作品",
            value: works.filter((item) => item.accessLevel === "member").length,
            detail: "基础资料仍可发现",
            icon: ShieldCheck,
          },
        ]}
      />
      <section className="table-section">
        <div className="toolbar">
          <label className="search-control">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索作品名称或标签"
            />
          </label>
          <div className="status-filter">
            {(
              [
                ["all", "全部"],
                ["published", "已发布"],
                ["draft", "草稿"],
                ["withdrawn", "已下架"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={status === value ? "active" : ""}
                type="button"
                onClick={() => setStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>作品</th>
                <th>类型</th>
                <th>地区 / 年份</th>
                <th>权限</th>
                <th>发布状态</th>
                <th>最后更新</th>
                <th>
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((work) => (
                <tr key={work.id}>
                  <td>
                    <strong>{work.title}</strong>
                    <small>{shortId(work.id)}</small>
                  </td>
                  <td>{workTypeLabels[work.type]}</td>
                  <td>
                    {work.region ?? "未知"} / {work.releaseYear ?? "未知"}
                  </td>
                  <td>
                    <AccessPill access={work.accessLevel} />
                  </td>
                  <td>
                    <StatusPill status={work.publicationStatus} />
                  </td>
                  <td>{formatDateTime(work.updatedAt)}</td>
                  <td>
                    <button className="row-action" type="button" onClick={() => onEdit(work.id)}>
                      编排
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <EmptyState label="没有匹配的作品" action="新建作品" onAction={onCreate} />
        ) : (
          <footer className="table-footer">显示 {filtered.length} 条结果</footer>
        )}
      </section>
    </div>
  );
}

function IngestionPage({
  items,
  onAttach,
  onRefresh,
}: {
  items: IngestionItem[];
  onAttach(item: IngestionItem): void;
  onRefresh(): Promise<void>;
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="page-stack">
      <PageIntro
        title="私有频道待入库媒体"
        description="文件先发送到 Telegram 私有存储频道，Bot 自动登记后在这里关联作品和内容单元。"
        summary={`${pendingCount(items)} 项待处理`}
        action={
          <div className="ingestion-tools">
            <button
              className="secondary"
              type="button"
              onClick={() => setGuideOpen((value) => !value)}
            >
              {guideOpen ? "收起上传说明" : "上传媒体说明"}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              <RefreshCw size={14} className={refreshing ? "spin" : undefined} /> 刷新列表
            </button>
          </div>
        }
      />
      {guideOpen && (
        <section className="upload-guide" aria-label="上传媒体说明">
          <div>
            <Archive size={20} />
            <div>
              <strong>从 Telegram 私有存储频道上传</strong>
              <p>
                管理台不直接接收媒体文件。请使用 Telegram 客户端将照片、browse/thumbnail
                图片、视频或 ZIP/CBZ 压缩包发送到已配置的私有频道；Bot 只保存文件 ID
                和元数据，压缩包仅在导入任务运行时下载到隔离临时目录。
              </p>
            </div>
          </div>
          <ol>
            <li>先发送媒体到私有存储频道，等待 Bot 完成登记。</li>
            <li>回到此页点击“刷新列表”，再点击对应记录的“关联入库”。</li>
            <li>压缩包关联时选择图片排序规则；它仅作为导入源，完成图片转换并核验后才可发布。</li>
            <li>封面请勾选“设为作品独立公开封面”；正文媒体关联后在作品编排中确认可用。</li>
          </ol>
          <p className="upload-guide-note">
            频道在 Bot 加入前发送的历史消息不会自动出现，请重新发送需要入库的媒体。
          </p>
        </section>
      )}
      {items.length === 0 ? (
        <section className="ingestion-empty">
          <Archive size={24} />
          <strong>暂无待入库媒体</strong>
          <p>先在 Telegram 私有存储频道发送媒体，再刷新此列表。</p>
          <button
            className="secondary"
            type="button"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw size={14} className={refreshing ? "spin" : undefined} /> 刷新列表
          </button>
        </section>
      ) : (
        <section className="table-section flush">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>文件</th>
                  <th>类型</th>
                  <th>大小 / 规格</th>
                  <th>频道消息</th>
                  <th>状态</th>
                  <th>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{textMetadata(item.mediaMetadata.fileName, "未命名媒体")}</strong>
                      <small>{formatDateTime(item.createdAt)}</small>
                    </td>
                    <td>{mediaTypeLabel(item.mediaMetadata.type)}</td>
                    <td>{formatMediaMetadata(item.mediaMetadata)}</td>
                    <td>#{item.sourceMessageId}</td>
                    <td>
                      <IngestionStatus status={item.status} />
                    </td>
                    <td>
                      <button
                        className="row-action"
                        type="button"
                        disabled={item.status === "linked"}
                        onClick={() => onAttach(item)}
                      >
                        {item.status === "linked" ? "已关联" : "关联入库"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ArchiveSortRulesPage({
  rules,
  onCreate,
  onDelete,
}: {
  rules: ArchiveSortRule[];
  onCreate(input: ArchiveSortRuleInput): Promise<void>;
  onDelete(ruleId: string): Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ArchiveSortRuleInput["kind"]>("natural");
  const [filePattern, setFilePattern] = useState("");
  const [chapterPattern, setChapterPattern] = useState("");
  const [pagePattern, setPagePattern] = useState("");
  const [direction, setDirection] = useState<ArchiveSortRuleInput["direction"]>("asc");
  const [priority, setPriority] = useState("200");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError("请填写规则名称");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || null,
        kind,
        filePattern: filePattern.trim() || null,
        chapterPattern: chapterPattern.trim() || null,
        pagePattern: pagePattern.trim() || null,
        direction,
        priority: Math.max(0, Number.parseInt(priority, 10) || 0),
        enabled,
      });
      setName("");
      setDescription("");
      setFilePattern("");
      setChapterPattern("");
      setPagePattern("");
      setPriority("200");
      setEnabled(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (rule: ArchiveSortRule) => {
    if (!window.confirm(`删除图片排序规则“${rule.name}”？`)) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(rule.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-stack">
      <PageIntro
        title="压缩包图片排序规则"
        description="ZIP 与 CBZ 导入时使用的图片筛选、章节识别和页序规则。内置规则可直接选用，自定义规则可新增或删除。"
        summary={`${rules.length} 条规则`}
      />
      <section className="table-section flush">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>规则</th>
                <th>排序方式</th>
                <th>过滤 / 捕获</th>
                <th>状态</th>
                <th>优先级</th>
                <th>
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <strong>{rule.name}</strong>
                    <small>{rule.description ?? "未填写说明"}</small>
                  </td>
                  <td>{archiveSortKindLabel(rule.kind)}</td>
                  <td>
                    <code>{rule.filePattern ?? "全部图片"}</code>
                    {rule.kind === "chapter_page" && (
                      <small>
                        章节：{rule.chapterPattern ?? "自动"}；页码：{rule.pagePattern ?? "自动"}
                      </small>
                    )}
                  </td>
                  <td>
                    <span className={rule.enabled ? "status published" : "status withdrawn"}>
                      {rule.enabled ? "启用" : "停用"}
                    </span>
                    {rule.system && <small>内置</small>}
                  </td>
                  <td>{rule.priority}</td>
                  <td>
                    {rule.system ? (
                      <small>内置规则</small>
                    ) : (
                      <button
                        className="row-action danger-text"
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(rule)}
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="plain-panel">
        <SectionHeading
          title="新增自定义规则"
          detail="正则可使用命名组 number 或第一个捕获组提取数字"
        />
        {error && (
          <div className="page-alert">
            <CircleAlert size={17} />
            <span>{error}</span>
          </div>
        )}
        <div className="field-grid three">
          <label>
            规则名称
            <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            排序方式
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="natural">自然文件名</option>
              <option value="numeric">数字序号</option>
              <option value="chapter_page">章节与页码</option>
              <option value="path">目录路径</option>
            </select>
          </label>
          <label>
            排序方向
            <select
              value={direction}
              onChange={(event) => setDirection(event.target.value as typeof direction)}
            >
              <option value="asc">正序</option>
              <option value="desc">倒序</option>
            </select>
          </label>
        </div>
        <label>
          说明
          <input
            value={description}
            maxLength={240}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="field-grid three">
          <label>
            图片过滤正则
            <input
              value={filePattern}
              maxLength={240}
              placeholder="例如 ^chapter-\\d+/"
              onChange={(event) => setFilePattern(event.target.value)}
            />
          </label>
          <label>
            章节捕获正则
            <input
              value={chapterPattern}
              maxLength={240}
              placeholder="例如 chapter-(?<number>\\d+)"
              disabled={kind !== "chapter_page"}
              onChange={(event) => setChapterPattern(event.target.value)}
            />
          </label>
          <label>
            页码捕获正则
            <input
              value={pagePattern}
              maxLength={240}
              placeholder="例如 page-(?<number>\\d+)"
              disabled={kind !== "chapter_page"}
              onChange={(event) => setPagePattern(event.target.value)}
            />
          </label>
        </div>
        <div className="field-grid">
          <label>
            优先级
            <input
              type="number"
              min="0"
              max="10000"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            新规则立即启用
          </label>
        </div>
        <div className="drawer-footer">
          <button className="publish" type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}新增规则
          </button>
        </div>
      </section>
    </div>
  );
}

function UsersPage({
  users,
  onChange,
}: {
  users: AdminUser[];
  onChange(user: AdminUser, active: boolean, expiresAt: string | null): Promise<void>;
}) {
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  return (
    <div className="page-stack">
      <PageIntro
        title="用户与会员权限"
        description="普通用户仍可发现会员作品基础资料，但不会获得目录和媒体访问能力。"
        summary={`${users.filter(membershipValid).length} 位有效会员`}
      />
      <section className="table-section flush">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>用户</th>
                <th>Telegram ID</th>
                <th>Bot 状态</th>
                <th>会员状态</th>
                <th>到期日</th>
                <th>
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const active = membershipValid(user);
                const fallbackDate = dateInputValue(
                  user.memberExpiresAt ?? new Date(Date.now() + 30 * 86_400_000).toISOString(),
                );
                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.displayName}</strong>
                      <small>{user.username ? `@${user.username}` : "无用户名"}</small>
                    </td>
                    <td>{user.telegramUserId}</td>
                    <td>{botStatusLabel(user.botSendStatus)}</td>
                    <td>
                      <span className={active ? "access member" : "access"}>
                        {active ? "会员" : "普通"}
                      </span>
                    </td>
                    <td>
                      <input
                        className="date-control"
                        type="date"
                        disabled={active}
                        value={expiry[user.id] ?? fallbackDate}
                        min={dateInputValue(new Date().toISOString())}
                        onChange={(event) =>
                          setExpiry((items) => ({ ...items, [user.id]: event.target.value }))
                        }
                        aria-label={`${user.displayName} 会员到期日`}
                      />
                    </td>
                    <td>
                      <button
                        className={active ? "row-action danger" : "row-action"}
                        type="button"
                        disabled={busyId === user.id}
                        onClick={async () => {
                          setBusyId(user.id);
                          const date = expiry[user.id] ?? fallbackDate;
                          try {
                            await onChange(
                              user,
                              !active,
                              active ? null : new Date(`${date}T23:59:59Z`).toISOString(),
                            );
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        {busyId === user.id ? "处理中" : active ? "关闭会员" : "开通会员"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AuditPage({ logs }: { logs: AuditLog[] }) {
  return (
    <div className="page-stack">
      <PageIntro
        title="管理员操作审计"
        description="所有写操作记录管理员、目标、请求追踪号与操作时间。"
        summary={`${logs.length} 条记录`}
      />
      <section className="table-section flush">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>动作</th>
                <th>目标</th>
                <th>管理员</th>
                <th>请求追踪号</th>
                <th>IP</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <strong>{actionLabel(log.action)}</strong>
                  </td>
                  <td>
                    {log.targetType} / {shortId(log.targetId ?? "-")}
                  </td>
                  <td>{shortId(log.adminId)}</td>
                  <td>
                    <code>{log.requestId}</code>
                  </td>
                  <td>{log.ipAddress ?? "未知"}</td>
                  <td>{formatDateTime(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SettingsPage({ settings, onToggle }: { settings: SystemSettings; onToggle(): void }) {
  return (
    <div className="settings-layout">
      <SettingsBand
        eyebrow="访问控制"
        title="会员权限总开关"
        description="关闭后所有已发布内容按公开权限计算；重新开启后恢复原有会员规则。"
      >
        <div className="setting-action">
          <strong>{settings.membershipEnabled ? "已开启" : "已关闭"}</strong>
          <Switch checked={settings.membershipEnabled} onChange={onToggle} label="切换会员权限" />
        </div>
      </SettingsBand>
      <SettingsBand
        eyebrow="推荐系统"
        title="当前算法版本"
        description="排行榜与推荐根据用户浏览、收藏与内容偏好计算。"
      >
        <code>{settings.recommendationVersion}</code>
      </SettingsBand>
      <SettingsBand
        eyebrow="会员引导"
        title={settings.membershipCtaText ?? "开通会员"}
        description="引导令牌与用户绑定，有效期 7 天，转化归因窗口为最近 30 天。"
      >
        <span className="environment-label">{settings.environment ?? "configured"}</span>
      </SettingsBand>
    </div>
  );
}

function GuidePage() {
  const workflow = [
    {
      title: "建立作品草稿",
      detail:
        "进入“作品”并点击“新建作品”，填写名称、主类型和访问级别。地区、年份、演员、作者等资料均为选填，留空会在用户端显示未知。",
    },
    {
      title: "创建目录和内容单元",
      detail:
        "保存草稿后进入作品编排，先建立与主类型匹配的目录，再添加电影、剧集、漫画章节、图片集、写真集或花絮视频等内容单元。",
    },
    {
      title: "上传至私有存储频道",
      detail:
        "将媒体直接发送到已配置的 Telegram 私有存储频道。视频应预先采用 Telegram 兼容格式；图片正文应准备浏览版，列表需要时同时准备缩略图。",
    },
    {
      title: "在待入库中关联",
      detail:
        "打开“待入库”，选择目标作品或内容单元并设置媒体角色、版本、展示范围和排序。图片的 source、browse、thumbnail 版本使用同一逻辑资源 ID。",
    },
    {
      title: "核验并设为可用",
      detail:
        "返回作品编排核对文件名、尺寸、类型、目标单元和顺序。确认正确后，将媒体状态从“待确认”设为“可用”。",
    },
    {
      title: "发布目录和单元",
      detail:
        "将需要展示的目录和内容单元分别设为“发布”。未发布、已下架或无可用媒体的内容不会出现在用户目录中。",
    },
    {
      title: "审核并发布作品",
      detail:
        "确认作品拥有独立公开封面、已发布目录、已发布内容单元和可用媒体后，点击“审核并发布”。系统提示问题时，按路径修正后再次提交。",
    },
  ];

  return (
    <div className="admin-guide page-stack">
      <PageIntro
        title="内容入库与发布流程"
        description="本项目采用单管理员审核。按下列顺序操作，可避免媒体已上传但用户端目录不可见。"
        summary="7 个步骤"
      />
      <section className="guide-workflow" aria-label="发布流程">
        {workflow.map((item, index) => (
          <div className="guide-workflow-row" key={item.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{item.title}</h2>
              <p>{item.detail}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="guide-reference">
        <div>
          <span>内容规则</span>
          <h2>目录必须与作品主类型一致</h2>
        </div>
        <dl>
          <div>
            <dt>影视</dt>
            <dd>可包含播放、剧集和剧照；同一视频有多个可用版本时，系统默认发送最高分辨率版本。</dd>
          </div>
          <div>
            <dt>漫画</dt>
            <dd>仅创建漫画目录和漫画章节，不关联视频内容。</dd>
          </div>
          <div>
            <dt>图集</dt>
            <dd>使用图片集，按排序序号控制浏览顺序。</dd>
          </div>
          <div>
            <dt>写真</dt>
            <dd>可包含写真集、补充图集和拍摄花絮视频。</dd>
          </div>
        </dl>
      </section>

      <section className="guide-reference">
        <div>
          <span>图片与封面</span>
          <h2>公开预览和受保护正文分开管理</h2>
        </div>
        <ul>
          <li>公开封面必须是独立的 browse 或 thumbnail 图片，并设为公开预览范围。</li>
          <li>正文图片设为受保护内容；用户端只读取合规浏览版，不提供图片源文件下载。</li>
          <li>同一图片的 source、browse、thumbnail 使用同一逻辑资源 ID，以便系统识别版本关系。</li>
          <li>图片入库后先核验元数据，再设为可用；错误文件不要进入发布链路。</li>
        </ul>
      </section>

      <section className="guide-reference">
        <div>
          <span>权限与运维</span>
          <h2>会员、审计和日常检查</h2>
        </div>
        <ul>
          <li>在“用户与会员”中设置会员状态和有效期；到期后用户不能发起新的会员内容访问。</li>
          <li>系统设置中的会员总开关关闭后，全部已发布内容按公开权限计算。</li>
          <li>普通用户仍可看到会员作品的安全基础资料和会员标识，但不能访问会员文件。</li>
          <li>发布、下架、会员变更和设置修改均应在“审计日志”中留下记录与请求追踪号。</li>
        </ul>
      </section>
    </div>
  );
}

function SettingsBand({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-band">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

function PageIntro({
  title,
  description,
  summary,
  action,
}: {
  title: string;
  description: string;
  summary: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-intro">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="section-intro-side">
        <span>{summary}</span>
        {action}
      </div>
    </div>
  );
}

function Metrics({
  values,
}: {
  values: Array<{ label: string; value: string | number; detail: string; icon: typeof Library }>;
}) {
  return (
    <section className="metrics" aria-label="关键指标">
      {values.map(({ label, value, detail, icon: Icon }) => (
        <div key={label}>
          <span>
            <Icon size={17} /> {label}
          </span>
          <strong>{value}</strong>
          <small>{detail}</small>
        </div>
      ))}
    </section>
  );
}

function SectionHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        <span>{detail}</span>
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: PublicationStatus }) {
  return <span className={`status ${status}`}>{publicationLabels[status]}</span>;
}

function AccessPill({ access }: { access: AdminWork["accessLevel"] }) {
  return (
    <span className={access === "member" ? "access member" : "access"}>
      {access === "member" ? "会员" : access === "public" ? "公开" : "继承"}
    </span>
  );
}

function IngestionStatus({ status }: { status: string }) {
  return (
    <span className={`ingestion-state ${status}`}>
      {status === "linked" ? "已关联" : status === "failed" ? "失败" : "待处理"}
    </span>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange(): void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={checked ? "switch on" : "switch"}
      onClick={onChange}
    >
      <i />
    </button>
  );
}

function LoadingState() {
  return (
    <div className="loading-state">
      <LoaderCircle className="spin" size={23} />
      <span>正在加载管理数据</span>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <div className="error-state">
      <CircleAlert size={27} />
      <strong>管理台暂未连接</strong>
      <p>{message}</p>
      <button className="secondary" type="button" onClick={onRetry}>
        <RefreshCw size={15} /> 重新连接
      </button>
    </div>
  );
}

function EmptyState({
  label,
  action,
  onAction,
}: {
  label: string;
  action: string;
  onAction(): void;
}) {
  return (
    <div className="empty-state">
      <Library size={22} />
      <strong>{label}</strong>
      <button type="button" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError)
    return error.requestId ? `${error.message}（请求 ${shortId(error.requestId)}）` : error.message;
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function pendingCount(items: IngestionItem[]) {
  return items.filter((item) => item.status === "pending").length;
}
function membershipValid(user: AdminUser) {
  return (
    user.memberActive && (!user.memberExpiresAt || Date.parse(user.memberExpiresAt) > Date.now())
  );
}
function initial(name?: string) {
  return name?.trim().slice(0, 1) || "管";
}
export function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
export function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "未知"
    : new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}
function dateInputValue(value: string) {
  return value.slice(0, 10);
}
export function formatBytes(value: number | null) {
  if (!value) return "未知大小";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} GB`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(value / 1000)} KB`;
}
function textMetadata(value: unknown, fallback: string) {
  return typeof value === "string" && value ? value : fallback;
}
function formatMediaMetadata(metadata: Record<string, unknown>) {
  const size = typeof metadata.fileSize === "number" ? formatBytes(metadata.fileSize) : "未知大小";
  const dimensions =
    typeof metadata.width === "number" && typeof metadata.height === "number"
      ? `${metadata.width}×${metadata.height}`
      : "未知规格";
  return `${size} · ${dimensions}`;
}
function mediaTypeLabel(value: unknown) {
  return value === "video"
    ? "视频"
    : value === "image"
      ? "图片"
      : value === "archive"
        ? "压缩包"
        : value === "file" || value === "document"
          ? "文件"
          : "未知";
}
function archiveSortKindLabel(value: ArchiveSortRule["kind"]) {
  return value === "numeric"
    ? "数字序号"
    : value === "chapter_page"
      ? "章节与页码"
      : value === "path"
        ? "目录路径"
        : "自然文件名";
}
function botStatusLabel(value: AdminUser["botSendStatus"]) {
  return value === "available"
    ? "可发送"
    : value === "not_started"
      ? "未启动 Bot"
      : value === "blocked"
        ? "已屏蔽 Bot"
        : "未知";
}
function actionLabel(value: string) {
  const labels: Record<string, string> = {
    "work.create": "创建作品",
    "work.update": "更新作品",
    "work.publish": "发布作品",
    "work.withdraw": "下架作品",
    "section.create": "创建目录",
    "section.update": "更新目录",
    "unit.create": "创建内容单元",
    "unit.update": "更新内容单元",
    "media.update": "确认媒体",
    "media.promote_cover": "设置独立封面",
    "ingestion.attach": "关联入库媒体",
    "archive_sort_rule.create": "新增图片排序规则",
    "archive_sort_rule.delete": "删除图片排序规则",
    "user.membership": "调整会员",
    "settings.membership": "切换会员权限",
  };
  return labels[value] ?? value;
}
