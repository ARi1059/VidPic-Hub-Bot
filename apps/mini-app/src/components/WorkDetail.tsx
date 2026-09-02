import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatalogUnit, WorkListItem } from "@film-bot/contracts";
import gsap from "gsap";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  CircleAlert,
  Crown,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Play,
  RotateCcw,
  Send,
} from "lucide-react";

import { deliveryStartUrl, errorMessage, MiniAppApiError, miniAppApi } from "../api.js";
import { telegram } from "../telegram.js";
import { ComicReader } from "../readers/ComicReader.js";
import { GalleryViewer } from "../readers/GalleryViewer.js";

interface ReaderSelection {
  unit: CatalogUnit;
  siblings: CatalogUnit[];
}

export function WorkDetail(props: {
  initialWork: WorkListItem;
  initialUnitId?: string | null;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const detailRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [reader, setReader] = useState<ReaderSelection | null>(null);
  const [videoUnit, setVideoUnit] = useState<CatalogUnit | null>(null);
  const [deliveryId, setDeliveryId] = useState<string | null>(null);
  const deliveryKeys = useRef(new Map<string, { key: string; createdAt: number }>());
  const deepLinkSent = useRef(false);
  const detailQuery = useQuery({
    queryKey: ["work", props.initialWork.id],
    queryFn: () => miniAppApi.getWork(props.initialWork.id),
  });
  const favoritesQuery = useQuery({
    queryKey: ["favorites"],
    queryFn: () => miniAppApi.listFavorites(),
  });
  const favoriteIds = useMemo(
    () => new Set(favoritesQuery.data?.map((work) => work.id) ?? []),
    [favoritesQuery.data],
  );
  const favorite = favoriteIds.has(props.initialWork.id);
  const favoriteMutation = useMutation({
    mutationFn: (next: boolean) => miniAppApi.setFavorite(props.initialWork.id, next),
    onSuccess: (result) => {
      telegram.impact("light");
      props.onToast(result.favorite ? "已加入收藏" : "已取消收藏");
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
    onError: (error) => props.onToast(errorMessage(error)),
  });
  const deliveryQuery = useQuery({
    queryKey: ["delivery", deliveryId],
    queryFn: () => miniAppApi.getVideoDelivery(deliveryId!),
    enabled: Boolean(deliveryId),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === "queued" || query.state.data?.status === "sending" ? 900 : false,
  });
  const deliveryMutation = useMutation({
    mutationFn: ({ unit, idempotencyKey }: { unit: CatalogUnit; idempotencyKey: string }) =>
      miniAppApi.createVideoDelivery(unit.id, idempotencyKey),
    onMutate: ({ unit }) => {
      setVideoUnit(unit);
      setDeliveryId(null);
    },
    onSuccess: (delivery) => {
      setDeliveryId(delivery.id);
      queryClient.setQueryData(["delivery", delivery.id], delivery);
      void queryClient.invalidateQueries({ queryKey: ["recent-deliveries"] });
    },
    onError: () => telegram.impact("heavy"),
  });
  const successNotified = useRef<string | null>(null);

  useEffect(() => {
    const delivery = deliveryQuery.data;
    if (delivery?.status !== "succeeded" || successNotified.current === delivery.id) return;
    successNotified.current = delivery.id;
    telegram.success();
    props.onToast("视频已发送到 Telegram 私聊");
    void queryClient.invalidateQueries({ queryKey: ["recent-deliveries"] });
  }, [deliveryQuery.data, props, queryClient]);

  useEffect(() => {
    if (!props.initialUnitId || !detailQuery.data) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`unit-${props.initialUnitId}`)?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [detailQuery.data, props.initialUnitId]);

  useEffect(() => {
    if (!props.initialUnitId || deepLinkSent.current || !detailQuery.data) return;
    const target =
      detailQuery.data.accessState === "locked"
        ? undefined
        : detailQuery.data.sections
            .flatMap((section) => section.units)
            .find((unit) => unit.id === props.initialUnitId);
    if (!target || isImageUnit(target)) return;
    deepLinkSent.current = true;
    const timer = window.setTimeout(() => {
      const stored = deliveryKeys.current.get(target.id);
      const idempotencyKey = stored?.key ?? crypto.randomUUID();
      deliveryKeys.current.set(target.id, { key: idempotencyKey, createdAt: Date.now() });
      deliveryMutation.mutate({ unit: target, idempotencyKey });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [detailQuery.data, props.initialUnitId, deliveryMutation]);

  useEffect(() => {
    if (reader) return;
    return telegram.setBackAction(props.onClose);
  }, [props.onClose, reader]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const targets = detailRef.current?.querySelectorAll(".detail-animate");
      if (!targets?.length) return;
      gsap.from(targets, {
        y: 16,
        opacity: 0,
        duration: 0.38,
        stagger: 0.045,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });
    },
    { scope: detailRef, dependencies: [detailQuery.data?.id] },
  );

  if (reader) {
    const shared = {
      unit: reader.unit,
      siblings: reader.siblings,
      onUnitChange: (unit: CatalogUnit) => setReader({ unit, siblings: reader.siblings }),
      onClose: () => setReader(null),
      onError: props.onToast,
    };
    return reader.unit.type === "comic_chapter" ? (
      <ComicReader key={reader.unit.id} {...shared} />
    ) : (
      <GalleryViewer key={reader.unit.id} {...shared} />
    );
  }

  if (detailQuery.isPending) {
    return (
      <div className="detail-view" ref={detailRef}>
        <DetailBack onClose={props.onClose} />
        <div className="page-state detail-state">
          <LoaderCircle className="spin" size={24} />
          <span>正在载入作品资料</span>
        </div>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="detail-view" ref={detailRef}>
        <DetailBack onClose={props.onClose} />
        <div className="page-state detail-state">
          <strong>作品资料暂未载入</strong>
          <span>{errorMessage(detailQuery.error)}</span>
          <button type="button" onClick={() => void detailQuery.refetch()}>
            <RotateCcw size={15} />
            重新加载
          </button>
        </div>
      </div>
    );
  }

  const work = detailQuery.data;
  const sections =
    work.accessState === "locked"
      ? []
      : work.sections.filter((section) => section.units.length > 0);
  const firstUnit = sections.flatMap((section) => section.units)[0];

  const sendVideo = (unit: CatalogUnit, forceNew = false) => {
    const stored = deliveryKeys.current.get(unit.id);
    const key =
      !forceNew && stored && Date.now() - stored.createdAt < 15_000
        ? stored.key
        : crypto.randomUUID();
    deliveryKeys.current.set(unit.id, { key, createdAt: Date.now() });
    deliveryMutation.reset();
    deliveryMutation.mutate({ unit, idempotencyKey: key });
  };

  const openUnit = (unit: CatalogUnit, siblings: CatalogUnit[]) => {
    if (isImageUnit(unit)) {
      setReader({ unit, siblings: siblings.filter(isImageUnit) });
      return;
    }
    telegram.impact("medium");
    sendVideo(unit);
  };

  const activeDelivery = deliveryQuery.data;
  const deliveryError = deliveryMutation.error ?? deliveryQuery.error;

  return (
    <div className="detail-view" ref={detailRef}>
      <div className="detail-cover">
        <img src={work.publicCover.url} alt={work.title} />
        <DetailBack onClose={props.onClose} />
        <span className="detail-type">{workTypeLabel(work.type)}</span>
      </div>
      <main className="detail-content">
        <section className="detail-heading detail-animate">
          <div>
            <span className="eyebrow">
              {work.metadata.region} · {work.metadata.year}
            </span>
            <h1>{work.title}</h1>
          </div>
          <button
            className="icon-button favorite-button"
            type="button"
            onClick={() => favoriteMutation.mutate(!favorite)}
            disabled={favoriteMutation.isPending}
            aria-label={favorite ? "取消收藏" : "收藏作品"}
            title={favorite ? "取消收藏" : "收藏作品"}
          >
            <Heart size={20} fill={favorite ? "currentColor" : "none"} />
          </button>
        </section>

        <div className="detail-facts detail-animate">
          {work.memberBadge && (
            <span className="member-fact">
              <Crown size={13} />
              会员内容
            </span>
          )}
          {work.metadata.tags.slice(0, 4).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <p className="description detail-animate">{work.summary ?? "暂无作品简介。"}</p>

        <dl className="metadata-list detail-animate">
          {metadataRows(work).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {work.accessState === "locked" ? (
          <section className="locked-band detail-animate">
            <LockKeyhole size={22} />
            <div>
              <h2>会员作品</h2>
              <p>基础资料可浏览，作品目录和媒体仅向会员开放。</p>
            </div>
            <button type="button" onClick={() => telegram.openLink(work.membershipCta.url)}>
              <Crown size={16} />
              {work.membershipCta.label}
            </button>
          </section>
        ) : (
          <>
            {firstUnit && (
              <button
                className="primary-command detail-animate"
                type="button"
                onClick={() => {
                  const section = sections.find((item) =>
                    item.units.some((unit) => unit.id === firstUnit.id),
                  );
                  openUnit(firstUnit, section?.units ?? [firstUnit]);
                }}
              >
                {isImageUnit(firstUnit) ? (
                  <BookOpen size={18} />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
                <span>
                  <strong>{primaryAction(work.type, Boolean(work.sections.length))}</strong>
                  <small>{firstUnit.title}</small>
                </span>
                <ChevronRight size={18} />
              </button>
            )}

            {(videoUnit || deliveryError) && (
              <VideoDeliveryStatus
                unit={videoUnit}
                pending={deliveryMutation.isPending}
                error={deliveryError}
                onRetry={() => videoUnit && sendVideo(videoUnit, true)}
                onToast={props.onToast}
                {...(activeDelivery ? { delivery: activeDelivery } : {})}
                {...(work.membershipCta?.url ? { membershipUrl: work.membershipCta.url } : {})}
              />
            )}

            {work.accessState === "partial" && work.membershipCta && (
              <button
                className="partial-band detail-animate"
                type="button"
                onClick={() => telegram.openLink(work.membershipCta?.url ?? "")}
              >
                <Crown size={18} />
                <span>
                  <strong>当前仅显示可访问内容</strong>
                  <small>开通会员可浏览完整目录</small>
                </span>
                <ChevronRight size={17} />
              </button>
            )}

            {sections.map((section) => (
              <section className="content-section detail-animate" key={section.id}>
                <div className="section-title-row">
                  <div>
                    <span>{sectionTypeLabel(section.type)}</span>
                    <h2>{section.title}</h2>
                  </div>
                  <small>{section.units.length} 项</small>
                </div>
                <div className="unit-list">
                  {section.units.map((unit, index) => (
                    <button
                      type="button"
                      className={`unit-row${videoUnit?.id === unit.id ? " active" : ""}`}
                      key={unit.id}
                      id={`unit-${unit.id}`}
                      onClick={() => openUnit(unit, section.units)}
                      disabled={
                        videoUnit?.id === unit.id &&
                        (deliveryMutation.isPending ||
                          activeDelivery?.status === "queued" ||
                          activeDelivery?.status === "sending")
                      }
                    >
                      <span className="unit-index">{String(index + 1).padStart(2, "0")}</span>
                      <span>
                        <strong>{unit.title}</strong>
                        <small>{unitActionLabel(unit)}</small>
                      </span>
                      {unitIcon(unit)}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

function VideoDeliveryStatus(props: {
  unit: CatalogUnit | null;
  delivery?: Awaited<ReturnType<typeof miniAppApi.getVideoDelivery>>;
  pending: boolean;
  error: Error | null;
  membershipUrl?: string;
  onRetry: () => void;
  onToast: (message: string) => void;
}) {
  const status = props.pending ? "queued" : props.delivery?.status;
  const startUrl = deliveryStartUrl(props.error);
  const code = props.error instanceof MiniAppApiError ? props.error.code : undefined;
  const failed = status === "failed" || Boolean(props.error);
  const succeeded = status === "succeeded";
  const title = props.error
    ? errorMessage(props.error)
    : status === "sending"
      ? "正在发送到 Telegram"
      : status === "succeeded"
        ? "已发送到 Telegram"
        : status === "failed"
          ? "发送未完成"
          : "已加入发送队列";
  const detail = props.error
    ? deliveryErrorDetail(code)
    : status === "succeeded"
      ? "返回私聊，使用 Telegram 原生播放器观看"
      : status === "failed"
        ? deliveryFailureDetail(props.delivery?.telegramErrorDescription)
        : `${props.unit?.title ?? "当前视频"} · 请稍候`;

  return (
    <section
      className={`delivery-status detail-animate${failed ? " failed" : ""}`}
      aria-live="polite"
    >
      <span className="delivery-status-icon">
        {succeeded ? (
          <CheckCircle2 size={19} />
        ) : failed ? (
          <CircleAlert size={19} />
        ) : (
          <LoaderCircle className="spin" size={19} />
        )}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {succeeded ? (
        <button
          type="button"
          onClick={() => {
            if (!telegram.close()) props.onToast("请返回 Telegram 私聊播放视频");
          }}
        >
          <Send size={14} />
          返回私聊
        </button>
      ) : startUrl ? (
        <button type="button" onClick={() => telegram.openLink(startUrl)}>
          打开 Bot
        </button>
      ) : code === "MEMBERSHIP_REQUIRED" && props.membershipUrl ? (
        <button type="button" onClick={() => telegram.openLink(props.membershipUrl!)}>
          <Crown size={14} />
          开通会员
        </button>
      ) : failed ? (
        <button type="button" onClick={props.onRetry} disabled={!props.unit}>
          <RotateCcw size={14} />
          重新发送
        </button>
      ) : null}
    </section>
  );
}

function deliveryErrorDetail(code?: string) {
  if (code === "BOT_NOT_STARTED") return "启动 Bot 后即可重新发送";
  if (code === "BOT_BLOCKED") return "解除屏蔽并重新启动 Bot 后再试";
  if (code === "MEMBERSHIP_REQUIRED") return "当前视频需要有效会员权限";
  if (code === "RATE_LIMITED") return "请稍候片刻再重新发送";
  return "请检查网络后重新发送";
}

function deliveryFailureDetail(reason?: string | null) {
  if (reason === "MEMBERSHIP_REQUIRED") return "发送期间会员权限已失效";
  if (reason === "MEDIA_UNAVAILABLE") return "视频资源状态已变化";
  if (reason === "CONTENT_UNAVAILABLE") return "当前内容已停止发布";
  if (reason === "BOT_BLOCKED" || reason === "BOT_NOT_STARTED") return "请重新启动 Bot 后再试";
  return "Telegram 暂未完成发送，请重新尝试";
}

function DetailBack(props: { onClose: () => void }) {
  return (
    <button className="detail-back" type="button" onClick={props.onClose} aria-label="返回">
      <ArrowLeft size={21} />
    </button>
  );
}

function isImageUnit(unit: CatalogUnit) {
  return (
    unit.type === "comic_chapter" || unit.type === "image_set" || unit.type === "photoshoot_set"
  );
}

function workTypeLabel(type: WorkListItem["type"]) {
  return { video: "影视", comic: "漫画", gallery: "图集", photoshoot: "写真" }[type];
}

function sectionTypeLabel(type: string) {
  return (
    {
      play: "FEATURE",
      episodes: "EPISODES",
      stills: "STILLS",
      comic_catalog: "CHAPTERS",
      gallery: "GALLERY",
      photoshoot: "PHOTOSET",
      behind_the_scenes: "BEHIND THE SCENES",
    }[type] ?? "CONTENT"
  );
}

function primaryAction(type: WorkListItem["type"], hasSections: boolean) {
  if (!hasSections) return "查看内容";
  if (type === "video") return "在 Telegram 播放";
  if (type === "comic") return "开始阅读";
  if (type === "photoshoot") return "查看写真";
  return "查看图集";
}

function unitActionLabel(unit: CatalogUnit) {
  if (unit.type === "comic_chapter") return "打开漫画阅读器";
  if (unit.type === "image_set") return "浏览缩略图与全屏图片";
  if (unit.type === "photoshoot_set") return "打开写真图集";
  return "发送到 Telegram 原生播放器";
}

function unitIcon(unit: CatalogUnit) {
  if (unit.type === "comic_chapter") return <BookOpen size={18} />;
  if (unit.type === "image_set" || unit.type === "photoshoot_set") return <ImageIcon size={18} />;
  if (unit.type === "behind_the_scenes_video") return <Clapperboard size={18} />;
  return <Play size={18} />;
}

function metadataRows(work: WorkListItem): Array<[string, string]> {
  const people =
    work.type === "comic"
      ? work.metadata.authors
      : work.type === "photoshoot" || work.type === "gallery"
        ? work.metadata.photographers
        : work.metadata.actors;
  const peopleLabel =
    work.type === "comic"
      ? "作者"
      : work.type === "photoshoot" || work.type === "gallery"
        ? "摄影"
        : "演员";
  return [
    ["地区", work.metadata.region],
    ["年份", String(work.metadata.year)],
    [peopleLabel, people.join("、")],
    ["状态", work.metadata.releaseStatus],
  ];
}
