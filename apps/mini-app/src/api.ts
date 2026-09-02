import type {
  ContentEventRequest,
  ReadingHistoryItem,
  ReadingProgress,
  RecommendationResult,
  SaveReadingProgressRequest,
  UnitImageManifest,
  VideoDelivery,
  WorkDetail,
  WorkListItem,
  WorkType,
} from "@film-bot/contracts";

import {
  mockHistoryFromProgress,
  mockId,
  mockImageManifests,
  mockWorkDetails,
  mockWorks,
} from "./mock-data.js";
import { telegram } from "./telegram.js";

export interface UserProfile {
  id: string;
  telegramUserId: string;
  displayName: string;
  memberActive: boolean;
  memberExpiresAt?: string | null;
}

export interface CatalogPage {
  items: WorkListItem[];
  nextCursor: string | null;
}

export interface WorkFilters {
  type?: WorkType;
  query?: string;
  cursor?: string;
  limit?: number;
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
  user: UserProfile & { admin: boolean };
}

export interface MiniAppApi {
  readonly isMock: boolean;
  initialize(): Promise<UserProfile>;
  listWorks(filters?: WorkFilters): Promise<CatalogPage>;
  getWork(workId: string): Promise<WorkDetail>;
  listFavorites(): Promise<WorkListItem[]>;
  setFavorite(workId: string, favorite: boolean): Promise<{ workId: string; favorite: boolean }>;
  listHistory(): Promise<ReadingHistoryItem[]>;
  getRecommendations(placement: "recommendations" | "rankings"): Promise<RecommendationResult>;
  recordContentEvent(event: ContentEventRequest): Promise<{ recorded: boolean }>;
  getImages(unitId: string): Promise<UnitImageManifest>;
  saveProgress(unitId: string, progress: SaveReadingProgressRequest): Promise<ReadingProgress>;
  createVideoDelivery(unitId: string, idempotencyKey: string): Promise<VideoDelivery>;
  getVideoDelivery(deliveryId: string): Promise<VideoDelivery>;
  listRecentDeliveries(): Promise<VideoDelivery[]>;
}

export class MiniAppApiError extends Error {
  public constructor(
    message: string,
    public readonly code = "INTERNAL_ERROR",
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

class HttpMiniAppApi implements MiniAppApi {
  public readonly isMock = false;
  private readonly baseUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  private readonly tokenKey = "film-bot-user-token";
  private readonly expiryKey = "film-bot-user-token-expiry";
  private readonly profileKey = "film-bot-user-profile";
  private profile: UserProfile | null = null;
  private authentication: Promise<string> | null = null;

  public async initialize() {
    await this.ensureToken();
    if (!this.profile) throw new MiniAppApiError("用户会话初始化失败", "AUTH_INVALID");
    return this.profile;
  }

  public listWorks(filters: WorkFilters = {}) {
    const params = new URLSearchParams({ limit: String(filters.limit ?? 30) });
    if (filters.type) params.set("type", filters.type);
    if (filters.query?.trim()) params.set("q", filters.query.trim());
    if (filters.cursor) params.set("cursor", filters.cursor);
    const route = filters.query?.trim() ? "/api/works/search" : "/api/works";
    return this.request<CatalogPage>(`${route}?${params.toString()}`);
  }

  public getWork(workId: string) {
    return this.request<WorkDetail>(`/api/works/${workId}`);
  }

  public listFavorites() {
    return this.request<WorkListItem[]>("/api/favorites");
  }

  public setFavorite(workId: string, favorite: boolean) {
    return this.request<{ workId: string; favorite: boolean }>(`/api/favorites/${workId}`, {
      method: favorite ? "PUT" : "DELETE",
      idempotencyKey: crypto.randomUUID(),
    });
  }

  public listHistory() {
    return this.request<ReadingHistoryItem[]>("/api/history");
  }

  public getRecommendations(placement: "recommendations" | "rankings") {
    return this.request<RecommendationResult>(
      placement === "recommendations" ? "/api/recommendations" : "/api/rankings",
    );
  }

  public recordContentEvent(event: ContentEventRequest) {
    return this.request<{ recorded: boolean }>("/api/events/content", {
      method: "POST",
      body: event,
    });
  }

  public getImages(unitId: string) {
    return this.request<UnitImageManifest>(`/api/units/${unitId}/images`);
  }

  public saveProgress(unitId: string, progress: SaveReadingProgressRequest) {
    return this.request<ReadingProgress>(`/api/reading-progress/${unitId}`, {
      method: "PUT",
      body: progress,
    });
  }

  public createVideoDelivery(unitId: string, idempotencyKey: string) {
    return this.request<VideoDelivery>("/api/deliveries/video", {
      method: "POST",
      body: { unitId, idempotencyKey },
    });
  }

  public getVideoDelivery(deliveryId: string) {
    return this.request<VideoDelivery>(`/api/deliveries/${deliveryId}`);
  }

  public listRecentDeliveries() {
    return this.request<VideoDelivery[]>("/api/deliveries/recent");
  }

  private async ensureToken(): Promise<string> {
    const storedToken = sessionStorage.getItem(this.tokenKey);
    const expiresAt = Date.parse(sessionStorage.getItem(this.expiryKey) ?? "");
    if (storedToken && Number.isFinite(expiresAt) && expiresAt > Date.now() + 30_000) {
      if (!this.profile) this.profile = storedProfile(this.profileKey);
      return storedToken;
    }
    if (!this.authentication) {
      this.authentication = this.authenticate().finally(() => {
        this.authentication = null;
      });
    }
    return this.authentication;
  }

  private async authenticate(): Promise<string> {
    const initData = telegram.initData.trim();
    if (!initData) {
      throw new MiniAppApiError(
        "请从 Telegram 打开 Mini App，或在本地启用模拟数据",
        "AUTH_INVALID",
      );
    }
    const response = await fetch(`${this.baseUrl}/api/auth/telegram`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData, audience: "user" }),
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
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
      idempotencyKey?: string;
    } = {},
  ): Promise<T> {
    const token = await this.ensureToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorPayload;
    if (!response.ok || !("data" in payload)) {
      if (response.status === 401) this.clearSession();
      throw apiError(payload);
    }
    return payload.data;
  }

  private clearSession() {
    this.profile = null;
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.expiryKey);
    sessionStorage.removeItem(this.profileKey);
  }
}

class MockMiniAppApi implements MiniAppApi {
  public readonly isMock = true;
  private readonly favoritesKey = "film-bot-mock-favorites";
  private readonly progressKey = "film-bot-mock-progress";
  private favorites = new Set(readStringArray(this.favoritesKey, [mockId(103)]));
  private progress = readProgress(this.progressKey);
  private deliveries = new Map<string, VideoDelivery>();
  private deliveryKeys = new Map<string, string>();
  private deliveryPolls = new Map<string, number>();

  public async initialize(): Promise<UserProfile> {
    await delay();
    return {
      id: mockId(900),
      telegramUserId: "100000001",
      displayName: "林川",
      memberActive: false,
      memberExpiresAt: null,
    };
  }

  public async listWorks(filters: WorkFilters = {}): Promise<CatalogPage> {
    await delay();
    const query = filters.query?.trim().toLocaleLowerCase() ?? "";
    const items = mockWorks.filter(
      (work) =>
        (!filters.type || work.type === filters.type) &&
        (!query ||
          work.title.toLocaleLowerCase().includes(query) ||
          work.metadata.aliases.some((alias) => alias.toLocaleLowerCase().includes(query)) ||
          work.metadata.tags.some((tag) => tag.toLocaleLowerCase().includes(query)) ||
          work.metadata.region.toLocaleLowerCase().includes(query) ||
          String(work.metadata.year).includes(query)),
    );
    return { items: structuredClone(items), nextCursor: null };
  }

  public async getWork(workId: string): Promise<WorkDetail> {
    await delay();
    const work = mockWorkDetails.find((item) => item.id === workId);
    if (!work) throw new MiniAppApiError("作品不存在", "NOT_FOUND");
    return structuredClone(work);
  }

  public async listFavorites(): Promise<WorkListItem[]> {
    await delay();
    return structuredClone(mockWorks.filter((work) => this.favorites.has(work.id)));
  }

  public async setFavorite(workId: string, favorite: boolean) {
    await delay(130);
    if (!mockWorks.some((work) => work.id === workId)) {
      throw new MiniAppApiError("作品不存在", "NOT_FOUND");
    }
    if (favorite) this.favorites.add(workId);
    else this.favorites.delete(workId);
    localStorage.setItem(this.favoritesKey, JSON.stringify([...this.favorites]));
    return { workId, favorite };
  }

  public async listHistory(): Promise<ReadingHistoryItem[]> {
    await delay();
    return structuredClone(mockHistoryFromProgress(this.progress));
  }

  public async getRecommendations(
    placement: "recommendations" | "rankings",
  ): Promise<RecommendationResult> {
    await delay();
    const order =
      placement === "recommendations"
        ? [mockId(102), mockId(103), mockId(101), mockId(107), mockId(104), mockId(106)]
        : [mockId(101), mockId(102), mockId(104), mockId(103), mockId(105), mockId(107)];
    const ordered = order.flatMap((id) => {
      const work = mockWorks.find((item) => item.id === id);
      return work ? [work] : [];
    });
    return {
      recommendationRequestId: crypto.randomUUID(),
      algorithmVersion: "mock-mvp-v1",
      coldStart: this.progress.size === 0 && this.favorites.size === 0,
      items: ordered.map((work, index) => ({
        rank: index + 1,
        score: Math.round((9.7 - index * 0.37) * 1000) / 1000,
        work: structuredClone(work),
      })),
    };
  }

  public async recordContentEvent() {
    await delay(30);
    return { recorded: true };
  }

  public async getImages(unitId: string): Promise<UnitImageManifest> {
    await delay();
    const current = mockImageManifests.get(unitId);
    if (!current) throw new MiniAppApiError("图片内容不存在", "NOT_FOUND");
    return {
      ...structuredClone(current),
      progress: this.progress.get(unitId)
        ? structuredClone(this.progress.get(unitId) ?? null)
        : null,
    };
  }

  public async saveProgress(
    unitId: string,
    input: SaveReadingProgressRequest,
  ): Promise<ReadingProgress> {
    await delay(45);
    const manifest = mockImageManifests.get(unitId);
    if (!manifest) throw new MiniAppApiError("图片内容不存在", "NOT_FOUND");
    const saved: ReadingProgress = {
      unitId,
      progressType: input.progressType,
      currentPage: Math.min(input.currentPage, Math.max(0, manifest.images.length - 1)),
      totalPages: manifest.images.length,
      scrollAnchor: input.scrollAnchor,
      readingMode: input.readingMode,
      pageLayout: input.pageLayout,
      readingDirection: input.readingDirection,
      updatedAt: new Date().toISOString(),
    };
    this.progress.set(unitId, saved);
    localStorage.setItem(this.progressKey, JSON.stringify([...this.progress.entries()]));
    return structuredClone(saved);
  }

  public async createVideoDelivery(unitId: string, idempotencyKey: string): Promise<VideoDelivery> {
    await delay(240);
    const scenario = new URLSearchParams(window.location.search).get("delivery");
    if (scenario === "not-started") {
      throw new MiniAppApiError("请先启动 Bot，再发送视频", "BOT_NOT_STARTED", undefined, {
        startUrl: "https://t.me/example_bot?start=miniapp",
      });
    }
    if (scenario === "blocked") {
      throw new MiniAppApiError(
        "Bot 当前无法向你发送消息，请解除屏蔽后重新启动 Bot",
        "BOT_BLOCKED",
        undefined,
        {
          startUrl: "https://t.me/example_bot?start=miniapp",
        },
      );
    }
    const existingId = this.deliveryKeys.get(idempotencyKey);
    const existing = existingId ? this.deliveries.get(existingId) : undefined;
    if (existing) return structuredClone(existing);

    const unit = mockWorkDetails
      .flatMap((work) =>
        work.accessState === "locked"
          ? []
          : work.sections.flatMap((section) =>
              section.units.map((candidate) => ({ candidate, work })),
            ),
      )
      .find(({ candidate }) => candidate.id === unitId);
    if (!unit || isImageUnitType(unit.candidate.type)) {
      throw new MiniAppApiError("视频内容不存在", "NOT_FOUND");
    }
    const delivery: VideoDelivery = {
      id: crypto.randomUUID(),
      workId: unit.work.id,
      unitId,
      workTitle: unit.work.title,
      unitTitle: unit.candidate.title,
      status: "queued",
      protectedContent: true,
      createdAt: new Date().toISOString(),
      sentAt: null,
      targetMessageId: null,
      telegramErrorCode: null,
      telegramErrorDescription: null,
    };
    this.deliveries.set(delivery.id, delivery);
    this.deliveryKeys.set(idempotencyKey, delivery.id);
    return structuredClone(delivery);
  }

  public async getVideoDelivery(deliveryId: string): Promise<VideoDelivery> {
    await delay(180);
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) throw new MiniAppApiError("发送任务不存在", "NOT_FOUND");
    const polls = (this.deliveryPolls.get(deliveryId) ?? 0) + 1;
    this.deliveryPolls.set(deliveryId, polls);
    const scenario = new URLSearchParams(window.location.search).get("delivery");
    if (scenario === "failed" && polls >= 2) {
      delivery.status = "failed";
      delivery.telegramErrorDescription = "BOT_DELIVERY_FAILED";
    } else if (polls >= 2) {
      delivery.status = "succeeded";
      delivery.sentAt = new Date().toISOString();
      delivery.targetMessageId = 8801;
    } else {
      delivery.status = "sending";
    }
    return structuredClone(delivery);
  }

  public async listRecentDeliveries(): Promise<VideoDelivery[]> {
    await delay();
    return structuredClone(
      [...this.deliveries.values()].toSorted((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    );
  }
}

function storedProfile(key: string): UserProfile | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null") as Partial<UserProfile> | null;
    return value &&
      typeof value.id === "string" &&
      typeof value.telegramUserId === "string" &&
      typeof value.displayName === "string" &&
      typeof value.memberActive === "boolean"
      ? (value as UserProfile)
      : null;
  } catch {
    return null;
  }
}

function apiError(payload: ApiErrorPayload): MiniAppApiError {
  return new MiniAppApiError(
    payload.message ?? "服务请求失败",
    payload.code ?? "INTERNAL_ERROR",
    payload.requestId,
    payload.details,
  );
}

function readStringArray(key: string, fallback: string[]) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

function readProgress(key: string): Map<string, ReadingProgress> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
    if (!Array.isArray(parsed)) return initialProgress();
    const rows = parsed.flatMap((entry) => {
      if (
        !Array.isArray(entry) ||
        typeof entry[0] !== "string" ||
        typeof entry[1] !== "object" ||
        entry[1] === null
      ) {
        return [];
      }
      return [[entry[0], entry[1] as ReadingProgress] as const];
    });
    return new Map(rows);
  } catch {
    return initialProgress();
  }
}

function initialProgress(): Map<string, ReadingProgress> {
  return new Map([
    [
      mockId(304),
      {
        unitId: mockId(304),
        progressType: "comic",
        currentPage: 2,
        totalPages: 8,
        scrollAnchor: "page-2",
        readingMode: "continuous",
        pageLayout: "single",
        readingDirection: "ltr",
        updatedAt: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
      },
    ],
  ]);
}

function delay(milliseconds = 190) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function isImageUnitType(type: string) {
  return type === "comic_chapter" || type === "image_set" || type === "photoshoot_set";
}

export function deliveryStartUrl(error: unknown): string | null {
  if (!(error instanceof MiniAppApiError) || typeof error.details !== "object" || !error.details) {
    return null;
  }
  const startUrl = (error.details as { startUrl?: unknown }).startUrl;
  return typeof startUrl === "string" ? startUrl : null;
}

export const miniAppApi: MiniAppApi =
  import.meta.env.VITE_ENABLE_MOCKS === "true" ? new MockMiniAppApi() : new HttpMiniAppApi();

export function errorMessage(error: unknown) {
  if (error instanceof MiniAppApiError && error.requestId) {
    return `${error.message}（请求 ${error.requestId.slice(0, 8)}）`;
  }
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}
