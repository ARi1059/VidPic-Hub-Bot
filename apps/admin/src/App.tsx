import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  CircleAlert,
  CircleCheck,
  LayoutDashboard,
  Library,
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
  type AuditLog,
  type IngestionItem,
  type PublicationStatus,
  type SystemSettings,
  type WorkType,
} from "./api.js";
import { IngestionDrawer, WorkEditor } from "./editors.js";

type Page = "概览" | "作品" | "待入库" | "用户与会员" | "审计日志" | "系统设置";
type StatusFilter = "all" | PublicationStatus;

const navigation: Array<{ label: Page; icon: typeof LayoutDashboard }> = [
  { label: "概览", icon: LayoutDashboard },
  { label: "作品", icon: Library },
  { label: "待入库", icon: Archive },
  { label: "用户与会员", icon: Users },
  { label: "审计日志", icon: ShieldCheck },
  { label: "系统设置", icon: Settings },
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
      const [nextProfile, nextWorks, nextSettings, nextUsers, nextIngestion, nextLogs] =
        await Promise.all([
          adminApi.initialize(),
          adminApi.listWorks(),
          adminApi.getSettings(),
          adminApi.listUsers(),
          adminApi.listIngestion(),
          adminApi.listAuditLogs(),
        ]);
      setProfile(nextProfile);
      setWorks(nextWorks);
      setSettings(nextSettings);
      setUsers(nextUsers);
      setIngestion(nextIngestion);
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
        {activePage === "待入库" && <IngestionPage items={ingestion} onAttach={setAttachItem} />}
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
}: {
  items: IngestionItem[];
  onAttach(item: IngestionItem): void;
}) {
  return (
    <div className="page-stack">
      <PageIntro
        title="私有频道待入库媒体"
        description="频道消息只记录 Telegram 文件标识与元数据，不在业务服务器保存媒体文件。"
        summary={`${pendingCount(items)} 项待处理`}
      />
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
}: {
  title: string;
  description: string;
  summary: string;
}) {
  return (
    <div className="section-intro">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <span>{summary}</span>
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
      : value === "document"
        ? "文件"
        : "未知";
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
    "ingestion.attach": "关联入库媒体",
    "user.membership": "调整会员",
    "settings.membership": "切换会员权限",
  };
  return labels[value] ?? value;
}
