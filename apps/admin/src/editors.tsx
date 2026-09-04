import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  Archive,
  CircleAlert,
  File,
  FileImage,
  FileVideo,
  LoaderCircle,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";

import {
  adminApi,
  AdminApiError,
  type AdminWork,
  type ArchiveSortRule,
  type ContentUnit,
  type IngestionItem,
  type MediaAsset,
  type PublicationStatus,
  type SectionType,
  type UnitType,
  type WorkBundle,
  type WorkInput,
  type WorkType,
} from "./api.js";
const workTypeLabels: Record<WorkType, string> = {
  video: "影视",
  comic: "漫画",
  gallery: "图集",
  photoshoot: "写真",
};

const publicationLabels: Record<PublicationStatus, string> = {
  draft: "草稿",
  published: "已发布",
  withdrawn: "已下架",
};

const sectionLabels: Record<SectionType, string> = {
  play: "播放",
  episodes: "剧集",
  stills: "剧照",
  comic_catalog: "漫画目录",
  gallery: "图集",
  photoshoot: "写真",
  behind_the_scenes: "拍摄花絮",
};

const unitLabels: Record<UnitType, string> = {
  movie: "电影",
  episode: "剧集",
  short_video: "短视频",
  comic_chapter: "漫画章节",
  image_set: "图片集",
  photoshoot_set: "写真集",
  behind_the_scenes_video: "花絮视频",
};

function archiveSortKindLabel(kind: ArchiveSortRule["kind"]) {
  return kind === "numeric"
    ? "数字序号"
    : kind === "chapter_page"
      ? "章节与页码"
      : kind === "path"
        ? "目录路径"
        : "自然文件名";
}

const sectionTypesByWork: Record<WorkType, SectionType[]> = {
  video: ["play", "episodes", "stills"],
  comic: ["comic_catalog"],
  gallery: ["gallery"],
  photoshoot: ["photoshoot", "gallery", "behind_the_scenes"],
};

const unitTypesByWork: Record<WorkType, UnitType[]> = {
  video: ["movie", "episode", "short_video", "image_set"],
  comic: ["comic_chapter"],
  gallery: ["image_set"],
  photoshoot: ["photoshoot_set", "image_set", "behind_the_scenes_video"],
};

export function WorkEditor({
  workId,
  onClose,
  onSaved,
}: {
  workId: string | null;
  onClose(): void;
  onSaved(message: string): Promise<void>;
}) {
  const [currentId, setCurrentId] = useState(workId);
  const [bundle, setBundle] = useState<WorkBundle | null>(null);
  const [form, setForm] = useState(workForm());
  const [loading, setLoading] = useState(Boolean(workId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Array<{ message: string; path: string }>>([]);
  const [sectionFormOpen, setSectionFormOpen] = useState(false);
  const [unitSectionId, setUnitSectionId] = useState<string | null>(null);

  const loadBundle = async (id: string) => {
    const next = await adminApi.getWork(id);
    setBundle(next);
    setForm(workForm(next.work));
  };

  useEffect(() => {
    if (!workId) return;
    void loadBundle(workId)
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoading(false));
  }, [workId]);

  const save = async (): Promise<AdminWork | null> => {
    if (!form.title.trim()) {
      setError("请输入作品名称");
      return null;
    }
    const existed = Boolean(currentId);
    setBusy(true);
    setError(null);
    setIssues([]);
    try {
      const input = workInput(form);
      const saved = currentId
        ? await adminApi.updateWork(currentId, input)
        : await adminApi.createWork(input);
      setCurrentId(saved.id);
      await loadBundle(saved.id);
      await onSaved(existed ? "作品资料已保存" : "作品草稿已创建");
      return saved;
    } catch (caught) {
      setError(errorMessage(caught));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    const saved = await save();
    if (!saved) return;
    setBusy(true);
    try {
      await adminApi.publishWork(saved.id);
      await loadBundle(saved.id);
      await onSaved("作品已通过校验并发布");
    } catch (caught) {
      setError(errorMessage(caught));
      setIssues(publicationIssues(caught));
    } finally {
      setBusy(false);
    }
  };

  const mutateBundle = async (action: () => Promise<unknown>, message: string) => {
    if (!currentId) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await loadBundle(currentId);
      await onSaved(message);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={currentId ? "作品编排" : "新建作品"}
      subtitle="单管理员审核与发布"
      onClose={onClose}
      wide
    >
      {loading ? (
        <div className="loading-state compact">
          <LoaderCircle className="spin" size={22} />
          正在加载作品
        </div>
      ) : (
        <>
          <div className="editor-body">
            {error && <InlineError message={error} />}
            <div className="form-section">
              <SectionHeading title="基础资料" detail="未填写的扩展字段在用户端显示未知" />
              <label>
                作品名称
                <input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="请输入作品名称"
                />
              </label>
              <div className="field-grid three">
                <label>
                  主类型
                  <select
                    value={form.type}
                    disabled={Boolean(bundle?.units.length)}
                    onChange={(event) => setForm({ ...form, type: event.target.value as WorkType })}
                  >
                    {Object.entries(workTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  访问级别
                  <select
                    value={form.accessLevel}
                    onChange={(event) => setForm({ ...form, accessLevel: event.target.value })}
                  >
                    <option value="public">公开</option>
                    <option value="member">会员</option>
                    <option value="inherit">系统默认</option>
                  </select>
                </label>
                <label>
                  年份
                  <input
                    type="number"
                    min="1800"
                    max="3000"
                    value={form.releaseYear}
                    onChange={(event) => setForm({ ...form, releaseYear: event.target.value })}
                    placeholder="未知"
                  />
                </label>
              </div>
              <div className="field-grid">
                <label>
                  地区
                  <input
                    value={form.region}
                    onChange={(event) => setForm({ ...form, region: event.target.value })}
                    placeholder="未知"
                  />
                </label>
                <label>
                  标签
                  <input
                    value={form.tags}
                    onChange={(event) => setForm({ ...form, tags: event.target.value })}
                    placeholder="剧情, 悬疑"
                  />
                </label>
              </div>
              <div className="field-grid">
                <label>
                  演员 / 主体
                  <input
                    value={form.actors}
                    onChange={(event) => setForm({ ...form, actors: event.target.value })}
                    placeholder="使用逗号分隔"
                  />
                </label>
                <label>
                  作者
                  <input
                    value={form.authors}
                    onChange={(event) => setForm({ ...form, authors: event.target.value })}
                    placeholder="使用逗号分隔"
                  />
                </label>
              </div>
              <label>
                作品简介
                <textarea
                  rows={3}
                  value={form.summary}
                  onChange={(event) => setForm({ ...form, summary: event.target.value })}
                  placeholder="选填，留空显示未知"
                />
              </label>
            </div>

            {bundle && (
              <div className="form-section orchestration">
                <SectionHeading
                  title="目录与媒体"
                  detail={`${bundle.sections.length} 个目录 · ${bundle.units.length} 个单元 · ${bundle.assets.length} 个媒体版本`}
                  action={
                    <button
                      className="small-command"
                      type="button"
                      onClick={() => setSectionFormOpen(true)}
                    >
                      <Plus size={14} /> 新增目录
                    </button>
                  }
                />
                {bundle.assets
                  .filter((asset) => !asset.unitId)
                  .map((asset) => (
                    <AssetRow
                      key={asset.id}
                      asset={asset}
                      isPublicCover={bundle.work.publicCoverAssetId === asset.id}
                      onAvailable={() =>
                        void mutateBundle(
                          () => adminApi.updateMedia(asset.id, { status: "available" }),
                          "媒体已设为可用",
                        )
                      }
                      onSetCover={() =>
                        void mutateBundle(
                          () =>
                            adminApi.updateWork(bundle.work.id, { publicCoverAssetId: asset.id }),
                          "公开封面已更新",
                        )
                      }
                    />
                  ))}
                {bundle.assets.filter((asset) => !asset.unitId).length === 0 && (
                  <div className="asset-empty cover-empty">
                    <strong>尚无作品级媒体</strong>
                    <span>
                      请先在 Telegram 私有存储频道发送封面图片，再到“待入库”关联为作品级公开封面。
                    </span>
                  </div>
                )}
                {sectionFormOpen && (
                  <NewSectionForm
                    workType={bundle.work.type}
                    onCancel={() => setSectionFormOpen(false)}
                    onSubmit={(input) => {
                      void mutateBundle(
                        () => adminApi.createSection(bundle.work.id, input),
                        "目录已创建",
                      ).then(() => setSectionFormOpen(false));
                    }}
                  />
                )}
                <div className="directory-list">
                  {bundle.sections.map((section) => {
                    const units = bundle.units.filter((unit) => unit.sectionId === section.id);
                    return (
                      <div className="directory-block" key={section.id}>
                        <header>
                          <div>
                            <strong>{section.title}</strong>
                            <small>
                              {sectionLabels[section.type]} · 顺序 {section.sortOrder}
                            </small>
                          </div>
                          <div>
                            <StatusPill status={section.publicationStatus} />
                            <button
                              className="text-command"
                              type="button"
                              onClick={() =>
                                void mutateBundle(
                                  () =>
                                    adminApi.updateSection(section.id, {
                                      publicationStatus:
                                        section.publicationStatus === "published"
                                          ? "draft"
                                          : "published",
                                    }),
                                  "目录状态已更新",
                                )
                              }
                            >
                              {section.publicationStatus === "published" ? "转草稿" : "设为发布"}
                            </button>
                            <button
                              className="text-command"
                              type="button"
                              onClick={() => setUnitSectionId(section.id)}
                            >
                              新增单元
                            </button>
                          </div>
                        </header>
                        {unitSectionId === section.id && (
                          <NewUnitForm
                            workType={bundle.work.type}
                            ordinal={nextOrdinal(units)}
                            onCancel={() => setUnitSectionId(null)}
                            onSubmit={(input) => {
                              void mutateBundle(
                                () => adminApi.createUnit(section.id, input),
                                "内容单元已创建",
                              ).then(() => setUnitSectionId(null));
                            }}
                          />
                        )}
                        {units.length === 0 ? (
                          <p className="inline-empty">当前目录暂无内容单元</p>
                        ) : (
                          units.map((unit) => (
                            <UnitRow
                              key={unit.id}
                              unit={unit}
                              assets={bundle.assets.filter((asset) => asset.unitId === unit.id)}
                              onToggle={() =>
                                void mutateBundle(
                                  () =>
                                    adminApi.updateUnit(unit.id, {
                                      publicationStatus:
                                        unit.publicationStatus === "published"
                                          ? "draft"
                                          : "published",
                                    }),
                                  "内容单元状态已更新",
                                )
                              }
                              onAvailable={(asset) =>
                                void mutateBundle(
                                  () => adminApi.updateMedia(asset.id, { status: "available" }),
                                  "媒体已设为可用",
                                )
                              }
                              onSetCover={(asset) =>
                                void mutateBundle(
                                  () => adminApi.promoteMediaCover(asset.id, bundle.work.id),
                                  "公开封面已更新",
                                )
                              }
                            />
                          ))
                        )}
                      </div>
                    );
                  })}
                  {bundle.sections.length === 0 && (
                    <p className="inline-empty">先创建与作品类型匹配的目录，再添加内容单元。</p>
                  )}
                </div>
              </div>
            )}

            <div className="validation-note">
              <CircleAlert size={17} />
              <span>发布必须具备独立公开封面、已发布目录与单元，以及状态为可用的媒体资源。</span>
            </div>
            {issues.length > 0 && (
              <div className="publication-issues" role="alert">
                <strong>发布校验发现 {issues.length} 项问题</strong>
                {issues.map((issue, index) => (
                  <div key={`${issue.path}-${index}`}>
                    <CircleAlert size={15} />
                    <span>
                      {issue.message}
                      <small>{issue.path}</small>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="drawer-footer">
            {bundle?.work.publicationStatus === "published" && (
              <button
                className="secondary danger-text"
                type="button"
                disabled={busy}
                onClick={() =>
                  void mutateBundle(() => adminApi.withdrawWork(bundle.work.id), "作品已下架")
                }
              >
                下架作品
              </button>
            )}
            <button className="secondary" type="button" disabled={busy} onClick={() => void save()}>
              保存资料
            </button>
            <button
              className="publish"
              type="button"
              disabled={busy}
              onClick={() => void publish()}
            >
              {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}审核并发布
            </button>
          </div>
        </>
      )}
    </Drawer>
  );
}

export function IngestionDrawer({
  item,
  works,
  archiveRules,
  onClose,
  onAttached,
}: {
  item: IngestionItem;
  works: AdminWork[];
  archiveRules: ArchiveSortRule[];
  onClose(): void;
  onAttached(): Promise<void>;
}) {
  const [workId, setWorkId] = useState(works[0]?.id ?? "");
  const [bundle, setBundle] = useState<WorkBundle | null>(null);
  const [unitId, setUnitId] = useState("");
  const [role, setRole] = useState(
    item.mediaMetadata.type === "video"
      ? "primary_video"
      : item.mediaMetadata.type === "image"
        ? "browse_image"
        : item.mediaMetadata.type === "archive"
          ? "archive_source"
          : "source_file",
  );
  const [variant, setVariant] = useState<"source" | "browse" | "thumbnail" | "">(
    item.mediaMetadata.type === "image" ? "browse" : "",
  );
  const [scope, setScope] = useState<"public_preview" | "protected_content">("protected_content");
  const [logicalAssetId, setLogicalAssetId] = useState("");
  const [archiveSortRuleId, setArchiveSortRuleId] = useState(
    item.mediaMetadata.type === "archive"
      ? (archiveRules.find((rule) => rule.enabled)?.id ?? "")
      : "",
  );
  const [ordinal, setOrdinal] = useState("0");
  const [setAsCover, setSetAsCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workId) return;
    setBundle(null);
    setUnitId("");
    void adminApi
      .getWork(workId)
      .then(setBundle)
      .catch((caught) => setError(errorMessage(caught)));
  }, [workId]);

  const submit = async () => {
    if (!workId || !role.trim()) {
      setError("请选择作品并填写媒体角色");
      return;
    }
    if (item.mediaMetadata.type === "archive" && !archiveSortRuleId) {
      setError("压缩包入库必须选择图片排序规则");
      return;
    }
    if (item.mediaMetadata.type === "image" && !logicalAssetId && !setAsCover) {
      setError("图片版本必须填写同组逻辑资源 ID");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const asset = await adminApi.attachIngestion(item.id, {
        ...(unitId ? { unitId } : { workId }),
        role:
          item.mediaMetadata.type === "archive"
            ? "archive_source"
            : setAsCover
              ? "public_cover"
              : role.trim(),
        variant:
          item.mediaMetadata.type === "archive" ? null : setAsCover ? "thumbnail" : variant || null,
        presentationScope:
          item.mediaMetadata.type === "archive"
            ? "protected_content"
            : setAsCover
              ? "public_preview"
              : scope,
        logicalAssetId: item.mediaMetadata.type === "archive" ? null : logicalAssetId || null,
        archiveSortRuleId: item.mediaMetadata.type === "archive" ? archiveSortRuleId : null,
        ordinal: Number(ordinal) || 0,
      });
      if (setAsCover) await adminApi.updateWork(workId, { publicCoverAssetId: asset.id });
      await onAttached();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer title="关联入库媒体" subtitle={`频道消息 #${item.sourceMessageId}`} onClose={onClose}>
      <div className="editor-body">
        {error && <InlineError message={error} />}
        <div className="source-summary">
          {item.mediaMetadata.type === "video" ? (
            <FileVideo size={21} />
          ) : item.mediaMetadata.type === "image" ? (
            <FileImage size={21} />
          ) : item.mediaMetadata.type === "archive" ? (
            <Archive size={21} />
          ) : (
            <File size={21} />
          )}
          <div>
            <strong>{textMetadata(item.mediaMetadata.fileName, "未命名媒体")}</strong>
            <span>{formatMediaMetadata(item.mediaMetadata)}</span>
          </div>
        </div>
        <label>
          目标作品
          <select value={workId} onChange={(event) => setWorkId(event.target.value)}>
            {works.map((work) => (
              <option key={work.id} value={work.id}>
                {work.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          目标内容单元
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            disabled={!bundle || setAsCover}
          >
            <option value="">作品级资源</option>
            {bundle?.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.title} · {unitLabels[unit.type]}
              </option>
            ))}
          </select>
        </label>
        {item.mediaMetadata.type !== "archive" && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={setAsCover}
              onChange={(event) => {
                setSetAsCover(event.target.checked);
                if (event.target.checked) setUnitId("");
              }}
            />
            设为作品独立公开封面
          </label>
        )}
        {!setAsCover && item.mediaMetadata.type !== "archive" && (
          <>
            <div className="field-grid">
              <label>
                媒体角色
                <input value={role} onChange={(event) => setRole(event.target.value)} />
              </label>
              <label>
                版本
                <select
                  value={variant}
                  onChange={(event) => setVariant(event.target.value as typeof variant)}
                >
                  <option value="">无版本</option>
                  <option value="source">source</option>
                  <option value="browse">browse</option>
                  <option value="thumbnail">thumbnail</option>
                </select>
              </label>
            </div>
            <label>
              展示范围
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value as typeof scope)}
              >
                <option value="protected_content">受保护内容</option>
                <option value="public_preview">公开预览</option>
              </select>
            </label>
          </>
        )}
        {item.mediaMetadata.type === "image" && !setAsCover && (
          <label>
            逻辑资源 ID
            <div className="input-command">
              <input
                value={logicalAssetId}
                onChange={(event) => setLogicalAssetId(event.target.value)}
                placeholder="source / browse / thumbnail 共用 UUID"
              />
              <button
                type="button"
                onClick={() => setLogicalAssetId(crypto.randomUUID())}
                aria-label="生成逻辑资源 ID"
                title="生成逻辑资源 ID"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </label>
        )}
        {item.mediaMetadata.type === "archive" && (
          <label>
            图片排序规则
            <select
              value={archiveSortRuleId}
              onChange={(event) => setArchiveSortRuleId(event.target.value)}
            >
              <option value="">选择排序规则</option>
              {archiveRules
                .filter((rule) => rule.enabled)
                .map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name} · {archiveSortKindLabel(rule.kind)}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          排序序号
          <input
            type="number"
            min="0"
            value={ordinal}
            onChange={(event) => setOrdinal(event.target.value)}
          />
        </label>
        <div className="validation-note">
          <CircleAlert size={17} />
          <span>
            {item.mediaMetadata.type === "archive"
              ? "压缩包只作为导入源。图片转换、三版本生成与预览核验完成前不能发布。"
              : "关联后媒体状态为待确认。请在作品编排中核验元数据并设为可用。"}
          </span>
        </div>
      </div>
      <div className="drawer-footer">
        <button className="secondary" type="button" onClick={onClose}>
          取消
        </button>
        <button
          className="publish"
          type="button"
          disabled={busy || !workId}
          onClick={() => void submit()}
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}确认关联
        </button>
      </div>
    </Drawer>
  );
}

function Drawer({
  title,
  subtitle,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  subtitle: string;
  onClose(): void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className={wide ? "editor-drawer wide" : "editor-drawer"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <span>{subtitle}</span>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}

function NewSectionForm({
  workType,
  onCancel,
  onSubmit,
}: {
  workType: WorkType;
  onCancel(): void;
  onSubmit(input: {
    type: SectionType;
    title: string;
    sortOrder: number;
    publicationStatus: PublicationStatus;
  }): void;
}) {
  const options = sectionTypesByWork[workType];
  const first = options[0] ?? "gallery";
  const [type, setType] = useState<SectionType>(first);
  const [title, setTitle] = useState(sectionLabels[first]);
  return (
    <div className="inline-form">
      <select
        value={type}
        onChange={(event) => {
          const next = event.target.value as SectionType;
          setType(next);
          setTitle(sectionLabels[next]);
        }}
      >
        {options.map((item) => (
          <option key={item} value={item}>
            {sectionLabels[item]}
          </option>
        ))}
      </select>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="目录名称"
      />
      <button
        type="button"
        onClick={() => onSubmit({ type, title, sortOrder: 0, publicationStatus: "draft" })}
      >
        创建
      </button>
      <button type="button" className="text-command" onClick={onCancel}>
        取消
      </button>
    </div>
  );
}

function NewUnitForm({
  workType,
  ordinal,
  onCancel,
  onSubmit,
}: {
  workType: WorkType;
  ordinal: number;
  onCancel(): void;
  onSubmit(input: {
    type: UnitType;
    title: string;
    ordinal: number;
    publicationStatus: PublicationStatus;
  }): void;
}) {
  const options = unitTypesByWork[workType];
  const first = options[0] ?? "image_set";
  const [type, setType] = useState<UnitType>(first);
  const [title, setTitle] = useState(unitLabels[first]);
  return (
    <div className="inline-form unit-form">
      <select
        value={type}
        onChange={(event) => {
          const next = event.target.value as UnitType;
          setType(next);
          setTitle(unitLabels[next]);
        }}
      >
        {options.map((item) => (
          <option key={item} value={item}>
            {unitLabels[item]}
          </option>
        ))}
      </select>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="内容单元名称"
      />
      <button
        type="button"
        onClick={() => onSubmit({ type, title, ordinal, publicationStatus: "draft" })}
      >
        创建
      </button>
      <button type="button" className="text-command" onClick={onCancel}>
        取消
      </button>
    </div>
  );
}

function UnitRow({
  unit,
  assets,
  onToggle,
  onAvailable,
  onSetCover,
}: {
  unit: ContentUnit;
  assets: MediaAsset[];
  onToggle(): void;
  onAvailable(asset: MediaAsset): void;
  onSetCover(asset: MediaAsset): void;
}) {
  return (
    <div className="unit-block">
      <div className="unit-heading">
        <span>{String(unit.ordinal + 1).padStart(2, "0")}</span>
        <div>
          <strong>{unit.title}</strong>
          <small>
            {unitLabels[unit.type]} · {assets.length} 个媒体版本
          </small>
        </div>
        <StatusPill status={unit.publicationStatus} />
        <button className="text-command" type="button" onClick={onToggle}>
          {unit.publicationStatus === "published" ? "转草稿" : "设为发布"}
        </button>
      </div>
      {assets.map((asset) => (
        <AssetRow
          key={asset.id}
          asset={asset}
          onAvailable={() => onAvailable(asset)}
          {...(canPromoteToCover(asset) ? { onSetCover: () => onSetCover(asset) } : {})}
        />
      ))}
      {assets.length === 0 && <p className="asset-empty">尚未关联媒体</p>}
    </div>
  );
}

function AssetRow({
  asset,
  isPublicCover = false,
  onAvailable,
  onSetCover,
}: {
  asset: MediaAsset;
  isPublicCover?: boolean;
  onAvailable(): void;
  onSetCover?: () => void;
}) {
  return (
    <div className="asset-row">
      {asset.type === "video" ? <FileVideo size={16} /> : <FileImage size={16} />}
      <div>
        <strong>{asset.fileName ?? asset.role}</strong>
        <small>
          {asset.variant ?? asset.type} · {formatBytes(asset.fileSize)} · {asset.presentationScope}
        </small>
      </div>
      <span className={`media-state ${asset.status}`}>{mediaStatusLabel(asset.status)}</span>
      {asset.status !== "available" && (
        <button type="button" onClick={onAvailable}>
          设为可用
        </button>
      )}
      {onSetCover && (
        <button type="button" disabled={isPublicCover} onClick={onSetCover}>
          {isPublicCover ? "当前封面" : "设为封面"}
        </button>
      )}
    </div>
  );
}

function canPromoteToCover(asset: MediaAsset) {
  return (
    asset.type === "image" &&
    (asset.variant === "browse" || asset.variant === "thumbnail") &&
    asset.presentationScope === "public_preview" &&
    asset.status === "available"
  );
}

function SectionHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        <span>{detail}</span>
      </div>
      {action}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="inline-error" role="alert">
      <CircleAlert size={16} /> {message}
    </div>
  );
}

function StatusPill({ status }: { status: PublicationStatus }) {
  return <span className={`status ${status}`}>{publicationLabels[status]}</span>;
}

interface WorkFormState {
  title: string;
  type: WorkType;
  accessLevel: string;
  summary: string;
  region: string;
  releaseYear: string;
  tags: string;
  actors: string;
  authors: string;
}

function workForm(work?: AdminWork): WorkFormState {
  return {
    title: work?.title ?? "",
    type: work?.type ?? "video",
    accessLevel: work?.accessLevel ?? "public",
    summary: work?.summary ?? "",
    region: work?.region ?? "",
    releaseYear: work?.releaseYear?.toString() ?? "",
    tags: work?.tags.join(", ") ?? "",
    actors: work?.actors.join(", ") ?? "",
    authors: work?.authors.join(", ") ?? "",
  };
}

function workInput(form: WorkFormState): WorkInput {
  return {
    title: form.title.trim(),
    type: form.type,
    accessLevel: form.accessLevel === "inherit" ? null : (form.accessLevel as "public" | "member"),
    summary: form.summary.trim() || null,
    region: form.region.trim() || null,
    releaseYear: form.releaseYear ? Number(form.releaseYear) : null,
    tags: splitList(form.tags),
    actors: splitList(form.actors),
    authors: splitList(form.authors),
  };
}

function splitList(value: string) {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function publicationIssues(error: unknown): Array<{ message: string; path: string }> {
  if (
    !(error instanceof AdminApiError) ||
    !isRecord(error.details) ||
    !Array.isArray(error.details.issues)
  )
    return [];
  return error.details.issues.flatMap((issue) =>
    isRecord(issue) && typeof issue.message === "string" && typeof issue.path === "string"
      ? [{ message: issue.message, path: issue.path }]
      : [],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}
function formatBytes(value: number | null) {
  if (!value) return "未知大小";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} GB`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(value / 1000)} KB`;
}
function nextOrdinal(units: ContentUnit[]) {
  return units.length === 0 ? 0 : Math.max(...units.map((unit) => unit.ordinal)) + 1;
}
function mediaStatusLabel(value: MediaAsset["status"]) {
  return value === "available"
    ? "可用"
    : value === "pending"
      ? "待确认"
      : value === "invalid"
        ? "无效"
        : "已撤回";
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
