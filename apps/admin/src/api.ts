export type WorkType = "video" | "comic" | "gallery" | "photoshoot";
export type PublicationStatus = "draft" | "published" | "withdrawn";
export type AccessLevel = "public" | "member" | null;
export type SectionType =
  "play" | "episodes" | "stills" | "comic_catalog" | "gallery" | "photoshoot" | "behind_the_scenes";
export type UnitType =
  | "movie"
  | "episode"
  | "short_video"
  | "comic_chapter"
  | "image_set"
  | "photoshoot_set"
  | "behind_the_scenes_video";

export interface AdminProfile {
  id: string;
  telegramUserId: string;
  displayName: string;
  memberActive: boolean;
  admin: boolean;
}

export interface AdminWork {
  id: string;
  type: WorkType;
  subtype: string | null;
  title: string;
  originalTitle: string | null;
  aliases: string[];
  summary: string | null;
  publicCoverAssetId: string | null;
  region: string | null;
  releaseYear: number | null;
  releaseDate: string | null;
  language: string | null;
  tags: string[];
  releaseStatus: string | null;
  contentRating: string | null;
  directors: string[];
  actors: string[];
  screenwriters: string[];
  producers: string[];
  productionCompanies: string[];
  totalEpisodes: number | null;
  durationSeconds: number | null;
  authors: string[];
  originalAuthors: string[];
  artists: string[];
  publisher: string | null;
  serializationPlatform: string | null;
  serializationStatus: string | null;
  photographers: string[];
  subjects: string[];
  studio: string | null;
  shootDate: string | null;
  location: string | null;
  volumeCount: number | null;
  publicationStatus: PublicationStatus;
  accessLevel: AccessLevel;
  sortOrder: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentSection {
  id: string;
  workId: string;
  type: SectionType;
  title: string;
  sortOrder: number;
  publicationStatus: PublicationStatus;
  accessLevel: AccessLevel;
  createdAt: string;
  updatedAt: string;
}

export interface ContentUnit {
  id: string;
  sectionId: string;
  type: UnitType;
  title: string;
  ordinal: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
  chapterNumber: string | null;
  summary: string | null;
  coverAssetId: string | null;
  publicationStatus: PublicationStatus;
  accessLevel: AccessLevel;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  workId: string | null;
  unitId: string | null;
  type: "video" | "image" | "thumbnail" | "cover" | "file";
  role: string;
  storageChatId: string;
  sourceMessageId: number;
  fileId: string;
  fileUniqueId: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  videoVersion: string | null;
  pixelCount: number | null;
  isPrimary: boolean;
  logicalAssetId: string | null;
  parentAssetId: string | null;
  variant: "source" | "browse" | "thumbnail" | null;
  presentationScope: "public_preview" | "protected_content";
  ordinal: number;
  status: "pending" | "available" | "invalid" | "withdrawn";
  createdAt: string;
  updatedAt: string;
}

export interface WorkBundle {
  work: AdminWork;
  sections: ContentSection[];
  units: ContentUnit[];
  assets: MediaAsset[];
}

export interface SystemSettings {
  id?: string;
  membershipEnabled: boolean;
  recommendationVersion: string;
  membershipCtaText?: string;
  membershipCtaUrl?: string | null;
  environment?: string;
  updatedAt?: string;
}

export interface AdminUser {
  id: string;
  telegramUserId: string;
  username: string | null;
  displayName: string;
  status: "active" | "suspended" | "deleted";
  memberActive: boolean;
  memberExpiresAt: string | null;
  botSendStatus: "unknown" | "available" | "not_started" | "blocked";
  lastActiveAt: string;
}

export interface IngestionItem {
  id: string;
  storageChatId: string;
  sourceMessageId: number;
  mediaMetadata: Record<string, unknown>;
  status: string;
  operatorAdminId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requestId: string;
  ipAddress: string | null;
  createdAt: string;
}

export interface WorkInput {
  type: WorkType;
  title: string;
  summary?: string | null;
  region?: string | null;
  releaseYear?: number | null;
  tags?: string[];
  actors?: string[];
  authors?: string[];
  publicCoverAssetId?: string | null;
  accessLevel?: AccessLevel;
  sortOrder?: number;
}

export interface SectionInput {
  type: SectionType;
  title: string;
  sortOrder: number;
  publicationStatus: PublicationStatus;
  accessLevel?: AccessLevel;
}

export interface UnitInput {
  type: UnitType;
  title: string;
  ordinal: number;
  publicationStatus: PublicationStatus;
  accessLevel?: AccessLevel;
}

export interface IngestionAttachInput {
  workId?: string | null;
  unitId?: string | null;
  role: string;
  variant?: "source" | "browse" | "thumbnail" | null;
  presentationScope: "public_preview" | "protected_content";
  logicalAssetId?: string | null;
  ordinal: number;
}

interface ApiEnvelope<T> {
  data: T;
  requestId: string;
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
  requestId?: string;
  details?: unknown;
}

interface AuthSession {
  accessToken: string;
  expiresAt: string;
  user: AdminProfile;
}

interface AdminApi {
  readonly isMock: boolean;
  initialize(): Promise<AdminProfile>;
  listWorks(): Promise<AdminWork[]>;
  getWork(workId: string): Promise<WorkBundle>;
  createWork(input: WorkInput): Promise<AdminWork>;
  updateWork(workId: string, input: Partial<WorkInput>): Promise<AdminWork>;
  publishWork(workId: string): Promise<AdminWork>;
  withdrawWork(workId: string): Promise<AdminWork>;
  createSection(workId: string, input: SectionInput): Promise<ContentSection>;
  updateSection(sectionId: string, input: Partial<SectionInput>): Promise<ContentSection>;
  createUnit(sectionId: string, input: UnitInput): Promise<ContentUnit>;
  updateUnit(unitId: string, input: Partial<UnitInput>): Promise<ContentUnit>;
  updateMedia(
    mediaId: string,
    input: { status?: MediaAsset["status"]; isPrimary?: boolean },
  ): Promise<MediaAsset>;
  getSettings(): Promise<SystemSettings>;
  setMembershipEnabled(enabled: boolean): Promise<SystemSettings>;
  listUsers(): Promise<AdminUser[]>;
  updateUserMembership(
    userId: string,
    active: boolean,
    expiresAt: string | null,
  ): Promise<AdminUser>;
  listIngestion(): Promise<IngestionItem[]>;
  attachIngestion(ingestionId: string, input: IngestionAttachInput): Promise<MediaAsset>;
  listAuditLogs(): Promise<AuditLog[]>;
}

export class AdminApiError extends Error {
  public constructor(
    message: string,
    public readonly code = "INTERNAL_ERROR",
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

class HttpAdminApi implements AdminApi {
  public readonly isMock = false;
  private readonly baseUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  private readonly tokenKey = "film-bot-admin-token";
  private readonly expiryKey = "film-bot-admin-token-expiry";
  private readonly profileKey = "film-bot-admin-profile";
  private profile: AdminProfile | null = null;
  private authentication: Promise<string> | null = null;

  public async initialize(): Promise<AdminProfile> {
    await this.ensureToken();
    if (!this.profile) throw new AdminApiError("管理员会话初始化失败", "AUTH_INVALID");
    return this.profile;
  }

  public listWorks() {
    return this.request<AdminWork[]>("/api/admin/works");
  }

  public getWork(workId: string) {
    return this.request<WorkBundle>(`/api/admin/works/${workId}`);
  }

  public createWork(input: WorkInput) {
    return this.request<AdminWork>("/api/admin/works", { method: "POST", body: input });
  }

  public updateWork(workId: string, input: Partial<WorkInput>) {
    return this.request<AdminWork>(`/api/admin/works/${workId}`, {
      method: "PATCH",
      body: input,
    });
  }

  public publishWork(workId: string) {
    return this.request<AdminWork>(`/api/admin/works/${workId}/publish`, { method: "POST" });
  }

  public withdrawWork(workId: string) {
    return this.request<AdminWork>(`/api/admin/works/${workId}/withdraw`, { method: "POST" });
  }

  public createSection(workId: string, input: SectionInput) {
    return this.request<ContentSection>(`/api/admin/works/${workId}/sections`, {
      method: "POST",
      body: input,
    });
  }

  public updateSection(sectionId: string, input: Partial<SectionInput>) {
    return this.request<ContentSection>(`/api/admin/sections/${sectionId}`, {
      method: "PATCH",
      body: input,
    });
  }

  public createUnit(sectionId: string, input: UnitInput) {
    return this.request<ContentUnit>(`/api/admin/sections/${sectionId}/units`, {
      method: "POST",
      body: input,
    });
  }

  public updateUnit(unitId: string, input: Partial<UnitInput>) {
    return this.request<ContentUnit>(`/api/admin/units/${unitId}`, {
      method: "PATCH",
      body: input,
    });
  }

  public updateMedia(
    mediaId: string,
    input: { status?: MediaAsset["status"]; isPrimary?: boolean },
  ) {
    return this.request<MediaAsset>(`/api/admin/media-assets/${mediaId}`, {
      method: "PATCH",
      body: input,
    });
  }

  public getSettings() {
    return this.request<SystemSettings>("/api/admin/settings");
  }

  public setMembershipEnabled(membershipEnabled: boolean) {
    return this.request<SystemSettings>("/api/admin/settings/membership", {
      method: "PATCH",
      body: { membershipEnabled },
    });
  }

  public listUsers() {
    return this.request<AdminUser[]>("/api/admin/users");
  }

  public updateUserMembership(userId: string, active: boolean, expiresAt: string | null) {
    return this.request<AdminUser>(`/api/admin/users/${userId}/membership`, {
      method: "PATCH",
      body: {
        active,
        expiresAt,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  }

  public listIngestion() {
    return this.request<IngestionItem[]>("/api/admin/ingestion");
  }

  public attachIngestion(ingestionId: string, input: IngestionAttachInput) {
    return this.request<MediaAsset>(`/api/admin/ingestion/${ingestionId}/attach`, {
      method: "POST",
      body: input,
    });
  }

  public listAuditLogs() {
    return this.request<AuditLog[]>("/api/admin/audit-logs");
  }

  private async ensureToken(): Promise<string> {
    const token = sessionStorage.getItem(this.tokenKey);
    const expiresAt = Date.parse(sessionStorage.getItem(this.expiryKey) ?? "");
    if (token && Number.isFinite(expiresAt) && expiresAt > Date.now() + 30_000) {
      if (!this.profile) this.profile = storedProfile(this.profileKey) ?? profileFromToken(token);
      return token;
    }

    if (!this.authentication) {
      this.authentication = this.authenticate().finally(() => {
        this.authentication = null;
      });
    }
    return this.authentication;
  }

  private async authenticate(): Promise<string> {
    const initData = window.Telegram?.WebApp?.initData?.trim() ?? "";
    if (!initData) {
      throw new AdminApiError(
        "请从 Telegram 管理入口打开管理台，或在本地启用 VITE_ENABLE_MOCKS=true",
        "AUTH_INVALID",
      );
    }
    const response = await fetch(`${this.baseUrl}/api/auth/telegram`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData, audience: "admin" }),
    });
    const payload = (await response.json()) as ApiEnvelope<AuthSession> | ApiErrorPayload;
    if (!response.ok || !("data" in payload)) throw apiError(payload);
    this.profile = payload.data.user;
    sessionStorage.setItem(this.tokenKey, payload.data.accessToken);
    sessionStorage.setItem(this.expiryKey, payload.data.expiresAt);
    sessionStorage.setItem(this.profileKey, JSON.stringify(payload.data.user));
    return payload.data.accessToken;
  }

  private async request<T>(
    path: string,
    options: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {},
  ): Promise<T> {
    const token = await this.ensureToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorPayload;
    if (!response.ok || !("data" in payload)) {
      if (response.status === 401) {
        sessionStorage.removeItem(this.tokenKey);
        sessionStorage.removeItem(this.expiryKey);
        sessionStorage.removeItem(this.profileKey);
      }
      throw apiError(payload);
    }
    return payload.data;
  }
}

function storedProfile(key: string): AdminProfile | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null") as Partial<AdminProfile> | null;
    return value &&
      typeof value.id === "string" &&
      typeof value.telegramUserId === "string" &&
      typeof value.displayName === "string" &&
      typeof value.memberActive === "boolean" &&
      typeof value.admin === "boolean"
      ? (value as AdminProfile)
      : null;
  } catch {
    return null;
  }
}

function apiError(payload: ApiErrorPayload): AdminApiError {
  return new AdminApiError(
    payload.message ?? "服务请求失败",
    payload.code ?? "INTERNAL_ERROR",
    payload.requestId,
    payload.details,
  );
}

function profileFromToken(token: string): AdminProfile {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as Record<string, unknown>;
    return {
      id: typeof payload.sub === "string" ? payload.sub : "",
      telegramUserId:
        typeof payload.telegramUserId === "string" ? payload.telegramUserId : "unknown",
      displayName: "管理员",
      memberActive: payload.memberActive === true,
      admin: payload.admin === true,
    };
  } catch {
    return {
      id: "",
      telegramUserId: "unknown",
      displayName: "管理员",
      memberActive: false,
      admin: true,
    };
  }
}

class MockAdminApi implements AdminApi {
  public readonly isMock = true;
  private readonly bundles = new Map<string, WorkBundle>(
    mockBundles.map((item) => [item.work.id, item]),
  );
  private readonly users = structuredClone(mockUsers);
  private readonly ingestion = structuredClone(mockIngestion);
  private readonly logs = structuredClone(mockAuditLogs);
  private settings: SystemSettings = {
    id: uuid(900),
    membershipEnabled: true,
    recommendationVersion: "mvp-v1",
    membershipCtaText: "开通会员",
    environment: "staging",
    updatedAt: now(),
  };

  public async initialize() {
    await delay();
    return {
      id: uuid(800),
      telegramUserId: "100000001",
      displayName: "内容管理员",
      memberActive: true,
      admin: true,
    };
  }

  public async listWorks() {
    await delay();
    return [...this.bundles.values()]
      .map((bundle) => structuredClone(bundle.work))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public async getWork(workId: string) {
    await delay();
    const bundle = this.bundles.get(workId);
    if (!bundle) throw new AdminApiError("作品不存在", "NOT_FOUND");
    return structuredClone(bundle);
  }

  public async createWork(input: WorkInput) {
    await delay();
    const work = makeWork(input, crypto.randomUUID());
    this.bundles.set(work.id, { work, sections: [], units: [], assets: [] });
    this.audit("work.create", "work", work.id);
    return structuredClone(work);
  }

  public async updateWork(workId: string, input: Partial<WorkInput>) {
    await delay();
    const bundle = this.requiredBundle(workId);
    bundle.work = { ...bundle.work, ...input, updatedAt: now() };
    this.audit("work.update", "work", workId);
    return structuredClone(bundle.work);
  }

  public async publishWork(workId: string) {
    await delay();
    const bundle = this.requiredBundle(workId);
    const issues: Array<{ code: string; path: string; message: string }> = [];
    if (!bundle.work.publicCoverAssetId) {
      issues.push({
        code: "PUBLIC_COVER_REQUIRED",
        path: "publicCoverAssetId",
        message: "已发布作品必须配置独立公开展示封面",
      });
    }
    if (!bundle.units.some((unit) => unit.publicationStatus === "published")) {
      issues.push({
        code: "PUBLISHED_UNIT_REQUIRED",
        path: "sections",
        message: "作品至少需要一个已发布内容单元",
      });
    }
    if (issues.length > 0) {
      throw new AdminApiError("作品未达到发布条件", "VALIDATION_FAILED", "mock-request", {
        issues,
      });
    }
    bundle.work.publicationStatus = "published";
    bundle.work.publishedAt = now();
    bundle.work.updatedAt = now();
    this.audit("work.publish", "work", workId);
    return structuredClone(bundle.work);
  }

  public async withdrawWork(workId: string) {
    await delay();
    const bundle = this.requiredBundle(workId);
    bundle.work.publicationStatus = "withdrawn";
    bundle.work.updatedAt = now();
    this.audit("work.withdraw", "work", workId);
    return structuredClone(bundle.work);
  }

  public async createSection(workId: string, input: SectionInput) {
    await delay();
    const bundle = this.requiredBundle(workId);
    const created: ContentSection = {
      id: crypto.randomUUID(),
      workId,
      ...input,
      accessLevel: input.accessLevel ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    bundle.sections.push(created);
    this.audit("section.create", "section", created.id);
    return structuredClone(created);
  }

  public async updateSection(sectionId: string, input: Partial<SectionInput>) {
    await delay();
    const section = [...this.bundles.values()]
      .flatMap((bundle) => bundle.sections)
      .find((item) => item.id === sectionId);
    if (!section) throw new AdminApiError("分区不存在", "NOT_FOUND");
    Object.assign(section, input, { updatedAt: now() });
    this.audit("section.update", "section", sectionId);
    return structuredClone(section);
  }

  public async createUnit(sectionId: string, input: UnitInput) {
    await delay();
    const bundle = [...this.bundles.values()].find((item) =>
      item.sections.some((section) => section.id === sectionId),
    );
    if (!bundle) throw new AdminApiError("分区不存在", "NOT_FOUND");
    const created: ContentUnit = {
      id: crypto.randomUUID(),
      sectionId,
      ...input,
      accessLevel: input.accessLevel ?? null,
      seasonNumber: null,
      episodeNumber: null,
      chapterNumber: null,
      summary: null,
      coverAssetId: null,
      createdAt: now(),
      updatedAt: now(),
    };
    bundle.units.push(created);
    this.audit("unit.create", "unit", created.id);
    return structuredClone(created);
  }

  public async updateUnit(unitId: string, input: Partial<UnitInput>) {
    await delay();
    const unit = [...this.bundles.values()]
      .flatMap((bundle) => bundle.units)
      .find((item) => item.id === unitId);
    if (!unit) throw new AdminApiError("内容单元不存在", "NOT_FOUND");
    Object.assign(unit, input, { updatedAt: now() });
    this.audit("unit.update", "unit", unitId);
    return structuredClone(unit);
  }

  public async updateMedia(
    mediaId: string,
    input: { status?: MediaAsset["status"]; isPrimary?: boolean },
  ) {
    await delay();
    const asset = [...this.bundles.values()]
      .flatMap((bundle) => bundle.assets)
      .find((item) => item.id === mediaId);
    if (!asset) throw new AdminApiError("媒体资源不存在", "NOT_FOUND");
    Object.assign(asset, input, { updatedAt: now() });
    this.audit("media.update", "media_asset", mediaId);
    return structuredClone(asset);
  }

  public async getSettings() {
    await delay();
    return structuredClone(this.settings);
  }

  public async setMembershipEnabled(membershipEnabled: boolean) {
    await delay();
    this.settings = { ...this.settings, membershipEnabled, updatedAt: now() };
    this.audit("settings.membership", "system_settings", this.settings.id ?? null);
    return structuredClone(this.settings);
  }

  public async listUsers() {
    await delay();
    return structuredClone(this.users);
  }

  public async updateUserMembership(userId: string, active: boolean, expiresAt: string | null) {
    await delay();
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw new AdminApiError("用户不存在", "NOT_FOUND");
    user.memberActive = active;
    user.memberExpiresAt = active ? expiresAt : null;
    this.audit("user.membership", "user", userId);
    return structuredClone(user);
  }

  public async listIngestion() {
    await delay();
    return structuredClone(this.ingestion);
  }

  public async attachIngestion(ingestionId: string, input: IngestionAttachInput) {
    await delay();
    const item = this.ingestion.find((entry) => entry.id === ingestionId);
    if (!item) throw new AdminApiError("入库记录不存在", "NOT_FOUND");
    const bundle = input.workId
      ? this.requiredBundle(input.workId)
      : [...this.bundles.values()].find((entry) =>
          entry.units.some((unit) => unit.id === input.unitId),
        );
    if (!bundle) throw new AdminApiError("请选择有效作品或内容单元", "VALIDATION_FAILED");
    const asset = mediaFromIngestion(item, input, bundle.work.id);
    bundle.assets.push(asset);
    item.status = "linked";
    item.updatedAt = now();
    this.audit("ingestion.attach", "ingestion_item", item.id);
    return structuredClone(asset);
  }

  public async listAuditLogs() {
    await delay();
    return structuredClone(this.logs);
  }

  private requiredBundle(workId: string): WorkBundle {
    const bundle = this.bundles.get(workId);
    if (!bundle) throw new AdminApiError("作品不存在", "NOT_FOUND");
    return bundle;
  }

  private audit(action: string, targetType: string, targetId: string | null) {
    this.logs.unshift({
      id: crypto.randomUUID(),
      adminId: uuid(800),
      action,
      targetType,
      targetId,
      before: null,
      after: null,
      requestId: `mock-${Date.now()}`,
      ipAddress: "127.0.0.1",
      createdAt: now(),
    });
  }
}

function makeWork(input: WorkInput, id: string): AdminWork {
  return {
    id,
    type: input.type,
    subtype: null,
    title: input.title,
    originalTitle: null,
    aliases: [],
    summary: input.summary ?? null,
    publicCoverAssetId: null,
    region: input.region ?? null,
    releaseYear: input.releaseYear ?? null,
    releaseDate: null,
    language: null,
    tags: input.tags ?? [],
    releaseStatus: null,
    contentRating: null,
    directors: [],
    actors: input.actors ?? [],
    screenwriters: [],
    producers: [],
    productionCompanies: [],
    totalEpisodes: null,
    durationSeconds: null,
    authors: input.authors ?? [],
    originalAuthors: [],
    artists: [],
    publisher: null,
    serializationPlatform: null,
    serializationStatus: null,
    photographers: [],
    subjects: [],
    studio: null,
    shootDate: null,
    location: null,
    volumeCount: null,
    publicationStatus: "draft",
    accessLevel: input.accessLevel ?? null,
    sortOrder: input.sortOrder ?? 0,
    publishedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

function mediaFromIngestion(
  item: IngestionItem,
  input: IngestionAttachInput,
  workId: string,
): MediaAsset {
  const metadata = item.mediaMetadata;
  const type = mediaType(metadata.type);
  const width = numberOrNull(metadata.width);
  const height = numberOrNull(metadata.height);
  return {
    id: crypto.randomUUID(),
    workId: input.unitId ? null : (input.workId ?? workId),
    unitId: input.unitId ?? null,
    type,
    role: input.role,
    storageChatId: item.storageChatId,
    sourceMessageId: item.sourceMessageId,
    fileId: String(metadata.fileId ?? "mock-file-id"),
    fileUniqueId: stringOrNull(metadata.fileUniqueId),
    fileName: stringOrNull(metadata.fileName),
    mimeType: stringOrNull(metadata.mimeType),
    fileSize: numberOrNull(metadata.fileSize),
    width,
    height,
    durationSeconds: numberOrNull(metadata.durationSeconds),
    videoVersion: null,
    pixelCount: width && height ? width * height : null,
    isPrimary: false,
    logicalAssetId: input.logicalAssetId ?? null,
    parentAssetId: null,
    variant: input.variant ?? null,
    presentationScope: input.presentationScope,
    ordinal: input.ordinal,
    status: "pending",
    createdAt: now(),
    updatedAt: now(),
  };
}

function mediaType(value: unknown): MediaAsset["type"] {
  return value === "video" || value === "image" || value === "thumbnail" || value === "cover"
    ? value
    : "file";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function now() {
  return new Date().toISOString();
}

function uuid(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function delay() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 120));
}

const workSeeds: Array<WorkInput & { id: string; status: PublicationStatus; cover: boolean }> = [
  {
    id: uuid(101),
    type: "video",
    title: "北境来信",
    summary: "一部包含正片与剧照的影视作品。",
    region: "中国大陆",
    releaseYear: 2026,
    tags: ["剧情", "悬疑"],
    actors: ["示例演员"],
    accessLevel: "member",
    status: "published",
    cover: true,
  },
  {
    id: uuid(102),
    type: "comic",
    title: "纸上城",
    summary: "连续阅读漫画样例。",
    region: "日本",
    releaseYear: 2025,
    tags: ["奇幻", "冒险"],
    authors: ["示例作者"],
    accessLevel: "public",
    status: "published",
    cover: true,
  },
  {
    id: uuid(103),
    type: "photoshoot",
    title: "七号摄影棚",
    summary: "写真与拍摄花絮混合内容。",
    region: "韩国",
    releaseYear: 2026,
    tags: ["人像", "幕后"],
    accessLevel: "member",
    status: "draft",
    cover: false,
  },
  {
    id: uuid(104),
    type: "gallery",
    title: "沿海公路",
    summary: "旅行摄影图集。",
    region: null,
    releaseYear: 2024,
    tags: ["旅行", "胶片"],
    accessLevel: "public",
    status: "withdrawn",
    cover: true,
  },
];

const mockBundles: WorkBundle[] = workSeeds.map((seed, index) => {
  const work = makeWork(seed, seed.id);
  work.publicationStatus = seed.status;
  work.publicCoverAssetId = seed.cover ? uuid(300 + index) : null;
  work.updatedAt = new Date(Date.now() - index * 3_600_000).toISOString();
  const sectionId = uuid(400 + index);
  const unitId = uuid(500 + index);
  const sectionType: SectionType =
    seed.type === "video"
      ? "episodes"
      : seed.type === "comic"
        ? "comic_catalog"
        : seed.type === "photoshoot"
          ? "photoshoot"
          : "gallery";
  const unitType: UnitType =
    seed.type === "video"
      ? "episode"
      : seed.type === "comic"
        ? "comic_chapter"
        : seed.type === "photoshoot"
          ? "photoshoot_set"
          : "image_set";
  const section: ContentSection = {
    id: sectionId,
    workId: seed.id,
    type: sectionType,
    title: seed.type === "video" ? "剧集" : "作品目录",
    sortOrder: 0,
    publicationStatus: seed.status === "published" ? "published" : "draft",
    accessLevel: null,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
  };
  const unit: ContentUnit = {
    id: unitId,
    sectionId,
    type: unitType,
    title: seed.type === "video" ? "第 1 集" : "第一辑",
    ordinal: 0,
    seasonNumber: null,
    episodeNumber: seed.type === "video" ? 1 : null,
    chapterNumber: seed.type === "comic" ? "1.00" : null,
    summary: null,
    coverAssetId: null,
    publicationStatus: seed.status === "published" ? "published" : "draft",
    accessLevel: null,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
  };
  const assets: MediaAsset[] = seed.status === "draft" ? [] : [mockAsset(seed.id, unitId, index)];
  return { work, sections: [section], units: [unit], assets };
});

function mockAsset(workId: string, unitId: string, index: number): MediaAsset {
  return {
    id: uuid(600 + index),
    workId: null,
    unitId,
    type: index === 0 ? "video" : "image",
    role: index === 0 ? "primary_video" : "browse_image",
    storageChatId: "-1000000000000",
    sourceMessageId: 100 + index,
    fileId: `mock-file-${index}`,
    fileUniqueId: `mock-unique-${index}`,
    fileName: index === 0 ? "episode-01.mp4" : "page-01.jpg",
    mimeType: index === 0 ? "video/mp4" : "image/jpeg",
    fileSize: index === 0 ? 1_800_000_000 : 2_400_000,
    width: 1920,
    height: 1080,
    durationSeconds: index === 0 ? 2700 : null,
    videoVersion: index === 0 ? "1080p" : null,
    pixelCount: 2_073_600,
    isPrimary: true,
    logicalAssetId: index === 0 ? null : uuid(700 + index),
    parentAssetId: null,
    variant: index === 0 ? null : "browse",
    presentationScope: "protected_content",
    ordinal: 0,
    status: "available",
    createdAt: now(),
    updatedAt: now(),
  };
}

const mockUsers: AdminUser[] = [
  {
    id: uuid(201),
    telegramUserId: "100000201",
    username: "north_reader",
    displayName: "林先生",
    status: "active",
    memberActive: true,
    memberExpiresAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    botSendStatus: "available",
    lastActiveAt: now(),
  },
  {
    id: uuid(202),
    telegramUserId: "100000202",
    username: "paper_city",
    displayName: "周女士",
    status: "active",
    memberActive: false,
    memberExpiresAt: null,
    botSendStatus: "not_started",
    lastActiveAt: new Date(Date.now() - 7_200_000).toISOString(),
  },
  {
    id: uuid(203),
    telegramUserId: "100000203",
    username: null,
    displayName: "陈先生",
    status: "active",
    memberActive: false,
    memberExpiresAt: null,
    botSendStatus: "blocked",
    lastActiveAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
];

const mockIngestion: IngestionItem[] = [
  {
    id: uuid(701),
    storageChatId: "-1000000000000",
    sourceMessageId: 8201,
    mediaMetadata: {
      type: "video",
      fileId: "mock-video-file",
      fileName: "north-episode-02.mp4",
      mimeType: "video/mp4",
      fileSize: 3_820_000_000,
      width: 1920,
      height: 1080,
      durationSeconds: 2810,
    },
    status: "pending",
    operatorAdminId: null,
    failureReason: null,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: uuid(702),
    storageChatId: "-1000000000000",
    sourceMessageId: 8202,
    mediaMetadata: {
      type: "image",
      fileId: "mock-image-file",
      fileName: "studio-page-01.jpg",
      mimeType: "image/jpeg",
      fileSize: 3_100_000,
      width: 2400,
      height: 3600,
    },
    status: "pending",
    operatorAdminId: null,
    failureReason: null,
    createdAt: new Date(Date.now() - 1_800_000).toISOString(),
    updatedAt: new Date(Date.now() - 1_800_000).toISOString(),
  },
  {
    id: uuid(703),
    storageChatId: "-1000000000000",
    sourceMessageId: 8200,
    mediaMetadata: { type: "image", fileName: "coast-cover.jpg", mimeType: "image/jpeg" },
    status: "linked",
    operatorAdminId: uuid(800),
    failureReason: null,
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 86_000_000).toISOString(),
  },
];

const mockAuditLogs: AuditLog[] = [
  {
    id: uuid(801),
    adminId: uuid(800),
    action: "work.update",
    targetType: "work",
    targetId: uuid(101),
    before: null,
    after: null,
    requestId: "mock-request-001",
    ipAddress: "127.0.0.1",
    createdAt: now(),
  },
  {
    id: uuid(802),
    adminId: uuid(800),
    action: "ingestion.attach",
    targetType: "ingestion_item",
    targetId: uuid(703),
    before: null,
    after: null,
    requestId: "mock-request-002",
    ipAddress: "127.0.0.1",
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
];

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string; ready?(): void; expand?(): void } };
  }
}

export const adminApi: AdminApi =
  import.meta.env.VITE_ENABLE_MOCKS === "true" ? new MockAdminApi() : new HttpAdminApi();
