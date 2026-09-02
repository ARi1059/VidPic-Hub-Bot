import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { useQuery } from "@tanstack/react-query";
import type { RecommendationResult, WorkListItem, WorkType } from "@film-bot/contracts";
import gsap from "gsap";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  ChevronRight,
  Clock3,
  Crown,
  Heart,
  Home,
  Layers3,
  LoaderCircle,
  Play,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

import { errorMessage, miniAppApi, type UserProfile } from "./api.js";
import { WorkDetail } from "./components/WorkDetail.js";
import { telegram } from "./telegram.js";

gsap.registerPlugin(useGSAP);

type NavigationTab = "home" | "explore" | "favorites" | "profile";
type Category = "all" | WorkType;

const categoryOptions: Array<{ value: Category; label: string }> = [
  { value: "all", label: "全部" },
  { value: "video", label: "影视" },
  { value: "comic", label: "漫画" },
  { value: "gallery", label: "图集" },
  { value: "photoshoot", label: "写真" },
];

const recordedImpressions = new Set<string>();

export function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>("home");
  const [selectedWork, setSelectedWork] = useState<WorkListItem | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: () => miniAppApi.initialize(),
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    telegram.initialize();
    const removeBack = telegram.setBackAction(null);
    return removeBack;
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!sessionQuery.data || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const workId = params.get("work");
    if (!workId) return;
    setSelectedUnitId(params.get("unit"));
    void miniAppApi
      .getWork(workId)
      .then((work) => setSelectedWork(work))
      .catch((error: unknown) => setToast(errorMessage(error)));
  }, [sessionQuery.data]);

  if (selectedWork) {
    return (
      <>
        <WorkDetail
          initialWork={selectedWork}
          initialUnitId={selectedUnitId}
          onClose={() => {
            setSelectedWork(null);
            setSelectedUnitId(null);
          }}
          onToast={setToast}
        />
        {toast && <Toast message={toast} />}
      </>
    );
  }

  if (sessionQuery.isPending) return <AppState label="正在进入片库" />;
  if (sessionQuery.isError) {
    return (
      <AppState
        title="Mini App 暂未连接"
        label={errorMessage(sessionQuery.error)}
        onRetry={() => void sessionQuery.refetch()}
      />
    );
  }

  return (
    <MainShell
      profile={sessionQuery.data}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onOpen={(work) => {
        setSelectedUnitId(null);
        setSelectedWork(work);
      }}
      toast={toast}
    />
  );
}

function MainShell(props: {
  profile: UserProfile;
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  onOpen: (work: WorkListItem) => void;
  toast: string | null;
}) {
  const appRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(".view-enter", {
        y: 12,
        opacity: 0,
        duration: 0.36,
        stagger: 0.035,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });
    },
    { scope: appRef, dependencies: [props.activeTab] },
  );

  return (
    <div className="app-shell" ref={appRef}>
      <TopBar
        profile={props.profile}
        activeTab={props.activeTab}
        onProfile={() => props.onTabChange("profile")}
      />
      <main className="page-content">
        {props.activeTab === "home" && <HomeView onOpen={props.onOpen} />}
        {props.activeTab === "explore" && <ExploreView onOpen={props.onOpen} />}
        {props.activeTab === "favorites" && <FavoritesView onOpen={props.onOpen} />}
        {props.activeTab === "profile" && (
          <ProfileView profile={props.profile} onOpen={props.onOpen} />
        )}
      </main>
      <BottomNavigation active={props.activeTab} onChange={props.onTabChange} />
      {props.toast && <Toast message={props.toast} />}
    </div>
  );
}

function TopBar(props: { profile: UserProfile; activeTab: NavigationTab; onProfile: () => void }) {
  const labels: Record<NavigationTab, string> = {
    home: "为你精选",
    explore: "发现内容",
    favorites: "我的收藏",
    profile: "个人中心",
  };
  return (
    <header className="top-bar view-enter">
      <div>
        <span className="brand-kicker">FILM LIBRARY</span>
        <strong className="brand">片库</strong>
      </div>
      <span className="top-context">{labels[props.activeTab]}</span>
      <button className="avatar" type="button" onClick={props.onProfile} aria-label="个人中心">
        {avatarLetter(props.profile.displayName)}
      </button>
    </header>
  );
}

function HomeView(props: { onOpen: (work: WorkListItem) => void }) {
  const recommendations = useQuery({
    queryKey: ["recommendations"],
    queryFn: () => miniAppApi.getRecommendations("recommendations"),
  });
  const rankings = useQuery({
    queryKey: ["rankings"],
    queryFn: () => miniAppApi.getRecommendations("rankings"),
  });
  const latest = useQuery({
    queryKey: ["works", "latest"],
    queryFn: () => miniAppApi.listWorks({ limit: 12 }),
  });
  const history = useQuery({ queryKey: ["history"], queryFn: () => miniAppApi.listHistory() });
  const recentDeliveries = useQuery({
    queryKey: ["recent-deliveries"],
    queryFn: () => miniAppApi.listRecentDeliveries(),
  });
  useRecommendationImpressions(recommendations.data, "recommendations");
  useRecommendationImpressions(rankings.data, "rankings");

  if (recommendations.isPending || latest.isPending) return <SectionLoading label="正在整理内容" />;
  if (recommendations.isError || latest.isError) {
    const issue = recommendations.error ?? latest.error;
    return (
      <SectionError
        message={errorMessage(issue)}
        onRetry={() => {
          void recommendations.refetch();
          void latest.refetch();
        }}
      />
    );
  }

  const featured = recommendations.data.items[0];
  const historyItem = history.data?.[0];
  const historyWork = historyItem
    ? latest.data.items.find((work) => work.id === historyItem.workId)
    : undefined;
  const recentDelivery = recentDeliveries.data?.[0];
  const recentWork = recentDelivery
    ? latest.data.items.find((work) => work.id === recentDelivery.workId)
    : undefined;

  const openRecommendation = (
    result: RecommendationResult,
    work: WorkListItem,
    placement: "recommendations" | "rankings",
  ) => {
    void miniAppApi.recordContentEvent({
      eventType: "click",
      workId: work.id,
      recommendationRequestId: result.recommendationRequestId,
      placement,
      idempotencyKey: crypto.randomUUID(),
    });
    props.onOpen(work);
  };

  return (
    <div className="home-view">
      {featured && (
        <button
          className="featured view-enter"
          type="button"
          onClick={() => openRecommendation(recommendations.data, featured.work, "recommendations")}
        >
          <img src={featured.work.publicCover.url} alt="" />
          <span className="featured-shade" />
          <span className="featured-copy">
            <span className="recommend-label">
              <Sparkles size={14} />
              {recommendations.data.coldStart ? "热门新作" : "为你推荐"}
            </span>
            <strong>{featured.work.title}</strong>
            <small>{featured.work.metadata.tags.slice(0, 3).join(" · ")}</small>
            <span className="featured-action">
              {featured.work.type === "video" ? (
                <Play size={16} fill="currentColor" />
              ) : (
                <BookOpen size={16} />
              )}
              查看作品
            </span>
          </span>
          {featured.work.memberBadge && (
            <span className="featured-member">
              <Crown size={13} />
              会员
            </span>
          )}
        </button>
      )}

      {historyItem && historyWork && (
        <section className="continue-band view-enter">
          <img src={historyItem.publicCover.url} alt="" />
          <div>
            <span>继续阅读</span>
            <strong>{historyItem.workTitle}</strong>
            <small>
              {historyItem.unitTitle} · 第 {historyItem.progress.currentPage + 1} 页
            </small>
          </div>
          <button type="button" onClick={() => props.onOpen(historyWork)} aria-label="继续阅读">
            <ArrowRight size={18} />
          </button>
        </section>
      )}

      {recentDelivery && recentWork && (
        <section className="continue-band sent-band view-enter">
          <img src={recentWork.publicCover.url} alt="" />
          <div>
            <span>最近发送</span>
            <strong>{recentDelivery.workTitle}</strong>
            <small>
              {recentDelivery.unitTitle} · {deliveryStatusLabel(recentDelivery.status)}
            </small>
          </div>
          <button type="button" onClick={() => props.onOpen(recentWork)} aria-label="查看最近发送">
            <ArrowRight size={18} />
          </button>
        </section>
      )}

      {recommendations.data.items.length > 1 && (
        <ContentSection eyebrow="FOR YOU" title="猜你喜欢" detail="根据你的内容偏好">
          <div className="work-rail">
            {recommendations.data.items.slice(1, 6).map(({ work, rank }) => (
              <WorkCard
                work={work}
                rank={rank}
                compact
                onOpen={() => openRecommendation(recommendations.data, work, "recommendations")}
                key={work.id}
              />
            ))}
          </div>
        </ContentSection>
      )}

      {rankings.data && rankings.data.items.length > 0 && (
        <ContentSection eyebrow="RANKING" title="偏好排行" detail={rankings.data.algorithmVersion}>
          <div className="ranking-list">
            {rankings.data.items.slice(0, 5).map(({ work, rank }) => (
              <button
                className="ranking-row"
                type="button"
                onClick={() => openRecommendation(rankings.data, work, "rankings")}
                key={work.id}
              >
                <span>{String(rank).padStart(2, "0")}</span>
                <img src={work.publicCover.url} alt="" />
                <span>
                  <strong>{work.title}</strong>
                  <small>{work.metadata.tags.slice(0, 2).join(" · ")}</small>
                </span>
                {work.memberBadge ? <Crown size={15} /> : <ChevronRight size={16} />}
              </button>
            ))}
          </div>
        </ContentSection>
      )}

      <ContentSection
        eyebrow="RECENT"
        title="最近更新"
        detail={`${latest.data.items.length} 部作品`}
      >
        <WorkGrid works={latest.data.items.slice(0, 6)} onOpen={props.onOpen} />
      </ContentSection>
    </div>
  );
}

function ExploreView(props: { onOpen: (work: WorkListItem) => void }) {
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const catalog = useQuery({
    queryKey: ["works", "catalog", category, deferredQuery],
    queryFn: () =>
      miniAppApi.listWorks({
        ...(category === "all" ? {} : { type: category }),
        ...(deferredQuery ? { query: deferredQuery } : {}),
        limit: 40,
      }),
  });

  return (
    <div className="explore-view">
      <label className="search-box view-enter">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索片名、别名、地区或标签"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="清除搜索">
            <X size={16} />
          </button>
        )}
      </label>
      <div className="category-tabs view-enter" role="tablist" aria-label="作品类型">
        {categoryOptions.map((option) => (
          <button
            type="button"
            role="tab"
            aria-selected={category === option.value}
            className={category === option.value ? "active" : ""}
            onClick={() => setCategory(option.value)}
            key={option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="section-heading view-enter">
        <div>
          <span>DISCOVER</span>
          <h1>{deferredQuery ? `“${deferredQuery}”` : categoryLabel(category)}</h1>
        </div>
        <small>{catalog.data?.items.length ?? 0} 部作品</small>
      </div>
      {catalog.isPending ? (
        <WorkSkeleton />
      ) : catalog.isError ? (
        <SectionError
          message={errorMessage(catalog.error)}
          onRetry={() => void catalog.refetch()}
        />
      ) : catalog.data.items.length > 0 ? (
        <WorkGrid works={catalog.data.items} onOpen={props.onOpen} />
      ) : (
        <EmptyState
          icon={<Search size={22} />}
          title="没有匹配的作品"
          detail="换一个关键词或分类试试"
        />
      )}
    </div>
  );
}

function FavoritesView(props: { onOpen: (work: WorkListItem) => void }) {
  const favorites = useQuery({
    queryKey: ["favorites"],
    queryFn: () => miniAppApi.listFavorites(),
  });
  if (favorites.isPending) return <SectionLoading label="正在载入收藏" />;
  if (favorites.isError) {
    return (
      <SectionError
        message={errorMessage(favorites.error)}
        onRetry={() => void favorites.refetch()}
      />
    );
  }
  return (
    <div>
      <div className="section-heading view-enter">
        <div>
          <span>SAVED</span>
          <h1>我的收藏</h1>
        </div>
        <small>{favorites.data.length} 部作品</small>
      </div>
      {favorites.data.length > 0 ? (
        <WorkGrid works={favorites.data} onOpen={props.onOpen} />
      ) : (
        <EmptyState
          icon={<Heart size={22} />}
          title="还没有收藏"
          detail="在作品详情中点击心形按钮即可收藏"
        />
      )}
    </div>
  );
}

function ProfileView(props: { profile: UserProfile; onOpen: (work: WorkListItem) => void }) {
  const history = useQuery({ queryKey: ["history"], queryFn: () => miniAppApi.listHistory() });
  const recentDeliveries = useQuery({
    queryKey: ["recent-deliveries"],
    queryFn: () => miniAppApi.listRecentDeliveries(),
  });
  const catalog = useQuery({
    queryKey: ["works", "profile"],
    queryFn: () => miniAppApi.listWorks({ limit: 40 }),
  });
  const membershipWork = catalog.data?.items.find((work) => work.accessState === "locked");
  return (
    <div className="profile-view">
      <div className="profile-header view-enter">
        <div className="profile-avatar">{avatarLetter(props.profile.displayName)}</div>
        <div>
          <span>{props.profile.memberActive ? "MEMBER" : "ACCOUNT"}</span>
          <h1>{props.profile.displayName || "Telegram 用户"}</h1>
          <p>{props.profile.memberActive ? "会员权限有效" : "普通用户"}</p>
        </div>
      </div>
      {!props.profile.memberActive && membershipWork?.membershipCta && (
        <button
          className="membership-row view-enter"
          type="button"
          onClick={() => telegram.openLink(membershipWork.membershipCta.url)}
        >
          <Crown size={20} />
          <span>
            <strong>升级会员</strong>
            <small>浏览全部会员作品</small>
          </span>
          <ChevronRight size={18} />
        </button>
      )}
      <ContentSection
        eyebrow="SENT"
        title="最近发送"
        detail={`${recentDeliveries.data?.length ?? 0} 条`}
      >
        {recentDeliveries.isPending ? (
          <SectionLoading label="正在载入发送记录" />
        ) : recentDeliveries.isError ? (
          <SectionError
            message={errorMessage(recentDeliveries.error)}
            onRetry={() => void recentDeliveries.refetch()}
          />
        ) : recentDeliveries.data.length > 0 ? (
          <div className="history-list">
            {recentDeliveries.data.map((item) => {
              const work = catalog.data?.items.find((candidate) => candidate.id === item.workId);
              return (
                <button
                  type="button"
                  disabled={!work}
                  onClick={() => work && props.onOpen(work)}
                  key={item.id}
                >
                  {work ? (
                    <img src={work.publicCover.url} alt="" />
                  ) : (
                    <span className="media-placeholder">
                      <Play size={17} />
                    </span>
                  )}
                  <span>
                    <strong>{item.workTitle}</strong>
                    <small>
                      {item.unitTitle} · {deliveryStatusLabel(item.status)}
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Send size={21} />}
            title="暂无发送记录"
            detail="选择视频后会显示发送状态"
          />
        )}
      </ContentSection>
      <ContentSection eyebrow="HISTORY" title="阅读记录" detail={`${history.data?.length ?? 0} 条`}>
        {history.isPending ? (
          <SectionLoading label="正在载入记录" />
        ) : history.isError ? (
          <SectionError
            message={errorMessage(history.error)}
            onRetry={() => void history.refetch()}
          />
        ) : history.data.length > 0 ? (
          <div className="history-list">
            {history.data.map((item) => {
              const work = catalog.data?.items.find((candidate) => candidate.id === item.workId);
              return (
                <button
                  type="button"
                  disabled={!work}
                  onClick={() => work && props.onOpen(work)}
                  key={item.unitId}
                >
                  <img src={item.publicCover.url} alt="" />
                  <span>
                    <strong>{item.workTitle}</strong>
                    <small>
                      {item.unitTitle} · 第 {item.progress.currentPage + 1} /{" "}
                      {item.progress.totalPages} 页
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Clock3 size={21} />}
            title="暂无阅读记录"
            detail="打开图集或漫画后会自动保存进度"
          />
        )}
      </ContentSection>
      <div className="account-note view-enter">
        <Bookmark size={18} />
        <span>
          <strong>Telegram 账号</strong>
          <small>ID {props.profile.telegramUserId}</small>
        </span>
      </div>
    </div>
  );
}

function WorkGrid(props: { works: WorkListItem[]; onOpen: (work: WorkListItem) => void }) {
  return (
    <div className="work-grid">
      {props.works.map((work) => (
        <WorkCard work={work} onOpen={() => props.onOpen(work)} key={work.id} />
      ))}
    </div>
  );
}

function WorkCard(props: {
  work: WorkListItem;
  onOpen: () => void;
  compact?: boolean;
  rank?: number;
}) {
  const work = props.work;
  return (
    <button
      className={props.compact ? "work-card compact" : "work-card"}
      onClick={props.onOpen}
      type="button"
    >
      <span className="poster-wrap">
        <img src={work.publicCover.url} alt={work.title} className="poster" loading="lazy" />
        <span className="type-mark">{workTypeLabel(work.type)}</span>
        {props.rank && <span className="rank-mark">#{props.rank}</span>}
        {work.memberBadge && (
          <span className="member-mark" aria-label="会员内容">
            <Crown size={13} />
          </span>
        )}
      </span>
      <span className="work-title">{work.title}</span>
      <span className="work-meta">
        {work.metadata.region} · {work.metadata.year}
      </span>
    </button>
  );
}

function ContentSection(props: {
  eyebrow: string;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section className="catalog-section view-enter">
      <div className="section-heading">
        <div>
          <span>{props.eyebrow}</span>
          <h2>{props.title}</h2>
        </div>
        <small>{props.detail}</small>
      </div>
      {props.children}
    </section>
  );
}

function BottomNavigation(props: {
  active: NavigationTab;
  onChange: (tab: NavigationTab) => void;
}) {
  const items: Array<{ value: NavigationTab; label: string; icon: ReactNode }> = [
    { value: "home", label: "首页", icon: <Home size={20} /> },
    { value: "explore", label: "分类", icon: <Layers3 size={20} /> },
    { value: "favorites", label: "收藏", icon: <Heart size={20} /> },
    { value: "profile", label: "我的", icon: <UserRound size={20} /> },
  ];
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {items.map((item) => (
        <button
          className={props.active === item.value ? "active" : ""}
          type="button"
          onClick={() => props.onChange(item.value)}
          key={item.value}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function useRecommendationImpressions(
  result: RecommendationResult | undefined,
  placement: "recommendations" | "rankings",
) {
  useEffect(() => {
    if (!result) return;
    for (const { work } of result.items.slice(0, 8)) {
      const key = `${result.recommendationRequestId}:${work.id}`;
      if (recordedImpressions.has(key)) continue;
      recordedImpressions.add(key);
      void miniAppApi.recordContentEvent({
        eventType: "impression",
        workId: work.id,
        recommendationRequestId: result.recommendationRequestId,
        placement,
        idempotencyKey: crypto.randomUUID(),
      });
    }
  }, [placement, result]);
}

function AppState(props: { title?: string; label: string; onRetry?: () => void }) {
  return (
    <div className="app-state">
      <span className="state-brand">片库</span>
      {props.onRetry ? <strong>{props.title}</strong> : <LoaderCircle className="spin" size={23} />}
      <p>{props.label}</p>
      {props.onRetry && (
        <button type="button" onClick={props.onRetry}>
          <RotateCcw size={15} />
          重新连接
        </button>
      )}
    </div>
  );
}

function SectionLoading(props: { label: string }) {
  return (
    <div className="page-state">
      <LoaderCircle className="spin" size={21} />
      <span>{props.label}</span>
    </div>
  );
}

function SectionError(props: { message: string; onRetry: () => void }) {
  return (
    <div className="page-state">
      <strong>内容暂未载入</strong>
      <span>{props.message}</span>
      <button type="button" onClick={props.onRetry}>
        <RotateCcw size={15} />
        重新加载
      </button>
    </div>
  );
}

function EmptyState(props: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="empty-state view-enter">
      {props.icon}
      <strong>{props.title}</strong>
      <span>{props.detail}</span>
    </div>
  );
}

function WorkSkeleton() {
  return (
    <div className="work-grid" aria-label="正在加载作品">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="work-skeleton" key={index} />
      ))}
    </div>
  );
}

function Toast(props: { message: string }) {
  return (
    <div className="status-toast" role="status">
      <Sparkles size={17} />
      {props.message}
    </div>
  );
}

function avatarLetter(name: string) {
  return name.trim().slice(0, 1) || "用";
}

function categoryLabel(category: Category) {
  return categoryOptions.find((option) => option.value === category)?.label ?? "全部";
}

function workTypeLabel(type: WorkType) {
  return { video: "影视", comic: "漫画", gallery: "图集", photoshoot: "写真" }[type];
}

function deliveryStatusLabel(status: "queued" | "sending" | "succeeded" | "failed") {
  return {
    queued: "排队中",
    sending: "发送中",
    succeeded: "已发送",
    failed: "发送未完成",
  }[status];
}
