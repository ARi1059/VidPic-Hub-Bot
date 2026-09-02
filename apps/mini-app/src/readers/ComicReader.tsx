import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatalogUnit, UnitImageManifest } from "@film-bot/contracts";
import gsap from "gsap";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Eye,
  EyeOff,
  GalleryHorizontal,
  LoaderCircle,
  PanelTop,
  RotateCcw,
  Rows3,
  Settings2,
} from "lucide-react";

import { errorMessage, miniAppApi } from "../api.js";
import { useAppStore } from "../store.js";
import { telegram } from "../telegram.js";
import { ReaderImage } from "./ReaderImage.js";
import { usePhotoSwipe } from "./usePhotoSwipe.js";
import { useReadingProgress } from "./useReadingProgress.js";

export function ComicReader(props: {
  unit: CatalogUnit;
  siblings: CatalogUnit[];
  onUnitChange: (unit: CatalogUnit) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const query = useQuery({
    queryKey: ["unit-images", props.unit.id],
    queryFn: () => miniAppApi.getImages(props.unit.id),
  });

  useEffect(() => {
    telegram.setReaderMode(true);
    const removeBack = telegram.setBackAction(props.onClose);
    return () => {
      removeBack();
      telegram.setReaderMode(false);
    };
  }, [props.onClose]);

  if (query.isPending) {
    return <ComicState title={props.unit.title} label="正在载入章节" onClose={props.onClose} />;
  }
  if (query.isError) {
    return (
      <ComicState
        title={props.unit.title}
        label={errorMessage(query.error)}
        onClose={props.onClose}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <ComicContent {...props} manifest={query.data} />;
}

function ComicContent(props: {
  unit: CatalogUnit;
  siblings: CatalogUnit[];
  manifest: UnitImageManifest;
  onUnitChange: (unit: CatalogUnit) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const queryClient = useQueryClient();
  const readingMode = useAppStore((state) => state.readingMode);
  const pageLayout = useAppStore((state) => state.pageLayout);
  const readingDirection = useAppStore((state) => state.readingDirection);
  const controlsVisible = useAppStore((state) => state.readerControlsVisible);
  const setReadingMode = useAppStore((state) => state.setReadingMode);
  const setPageLayout = useAppStore((state) => state.setPageLayout);
  const setReadingDirection = useAppStore((state) => state.setReadingDirection);
  const setControlsVisible = useAppStore((state) => state.setReaderControlsVisible);
  const wideLayout = useWideLayout();
  const effectiveLayout = pageLayout === "double" && wideLayout ? "double" : "single";
  const initialPage = Math.min(
    props.manifest.progress?.currentPage ?? 0,
    Math.max(0, props.manifest.images.length - 1),
  );
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const progressSettings = useMemo(
    () => ({ readingMode, pageLayout, readingDirection }),
    [pageLayout, readingDirection, readingMode],
  );
  const { update: updateProgress, flush: flushProgress } = useReadingProgress({
    unitId: props.unit.id,
    progressType: "comic",
    totalPages: props.manifest.images.length,
    settings: progressSettings,
    onError: (error) => props.onError(errorMessage(error)),
    onSaved: () => void queryClient.invalidateQueries({ queryKey: ["history"] }),
  });
  const setPage = useCallback(
    (page: number, shouldScroll = false) => {
      const bounded = Math.max(0, Math.min(page, Math.max(0, props.manifest.images.length - 1)));
      setCurrentPage(bounded);
      updateProgress(bounded, `page-${bounded}`);
      if (shouldScroll && readingMode === "continuous") {
        const target = scrollRef.current?.querySelector<HTMLElement>(
          `[data-page-index="${bounded}"]`,
        );
        target?.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    },
    [props.manifest.images.length, readingMode, updateProgress],
  );
  const itemKey = props.manifest.images.map((image) => image.logicalAssetId).join(":");
  const onLightboxChange = useCallback((index: number) => setPage(index), [setPage]);
  const lightbox = usePhotoSwipe({ itemKey, onChange: onLightboxChange });
  const siblingIndex = props.siblings.findIndex((item) => item.id === props.unit.id);
  const previousChapter = props.siblings[siblingIndex - 1];
  const nextChapter = props.siblings[siblingIndex + 1];
  const step = effectiveLayout === "double" ? 2 : 1;

  useEffect(() => {
    const saved = props.manifest.progress;
    if (!saved) return;
    setReadingMode(saved.readingMode);
    setPageLayout(saved.pageLayout);
    setReadingDirection(saved.readingDirection);
  }, [props.manifest.progress, setPageLayout, setReadingDirection, setReadingMode]);

  useEffect(() => {
    updateProgress(currentPage, `page-${currentPage}`);
  }, [currentPage, pageLayout, readingDirection, readingMode, updateProgress]);

  useEffect(() => {
    const candidates = [currentPage - 2, currentPage - 1, currentPage + 1, currentPage + 2];
    for (const index of candidates) {
      const src = props.manifest.images[index]?.browse.url;
      if (src) {
        const preload = new Image();
        preload.src = src;
      }
    }
  }, [currentPage, props.manifest.images]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.to(".comic-controls", {
        y: controlsVisible ? 0 : -16,
        opacity: controlsVisible ? 1 : 0,
        duration: 0.22,
        ease: "power2.out",
        pointerEvents: controlsVisible ? "auto" : "none",
      });
    },
    { scope: rootRef, dependencies: [controlsVisible] },
  );

  const changeChapter = (unit: CatalogUnit | undefined) => {
    if (!unit) return;
    flushProgress();
    props.onUnitChange(unit);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    swipeStart.current = event.clientX;
    suppressClick.current = false;
  };
  const onPointerUp = (event: React.PointerEvent) => {
    if (readingMode !== "paged" || swipeStart.current === null) return;
    const distance = event.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(distance) < 48) return;
    suppressClick.current = true;
    if (distance < 0) setPage(currentPage + step);
    else setPage(currentPage - step);
  };
  const onObservedPage = useCallback((page: number) => setPage(page), [setPage]);

  return (
    <div className="comic-reader" ref={rootRef} role="dialog" aria-modal="true">
      <header className="comic-top comic-controls">
        <button
          className="reader-icon"
          type="button"
          onClick={props.onClose}
          aria-label="返回作品目录"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <strong>{props.unit.title}</strong>
          <span>
            {currentPage + 1} / {props.manifest.images.length}
          </span>
        </div>
        <button
          className="reader-icon"
          type="button"
          onClick={() => setSettingsOpen((value) => !value)}
          aria-label="阅读设置"
          title="阅读设置"
        >
          <Settings2 size={19} />
        </button>
      </header>

      {!settingsOpen && (
        <button
          className="controls-toggle"
          type="button"
          onClick={() => setControlsVisible(!controlsVisible)}
          aria-label={controlsVisible ? "隐藏阅读控件" : "显示阅读控件"}
          title={controlsVisible ? "隐藏阅读控件" : "显示阅读控件"}
        >
          {controlsVisible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      )}

      {settingsOpen && controlsVisible && (
        <aside className="reader-settings comic-controls" aria-label="阅读设置">
          <ReaderSegment label="阅读方式">
            <SegmentButton
              active={readingMode === "continuous"}
              onClick={() => setReadingMode("continuous")}
              icon={<Rows3 size={15} />}
              label="滚动"
            />
            <SegmentButton
              active={readingMode === "paged"}
              onClick={() => setReadingMode("paged")}
              icon={<GalleryHorizontal size={15} />}
              label="分页"
            />
          </ReaderSegment>
          <ReaderSegment label="页面布局">
            <SegmentButton
              active={pageLayout === "single"}
              onClick={() => setPageLayout("single")}
              icon={<PanelTop size={15} />}
              label="单页"
            />
            <SegmentButton
              active={pageLayout === "double"}
              onClick={() => setPageLayout("double")}
              icon={<Columns2 size={15} />}
              label="双页"
            />
          </ReaderSegment>
          <ReaderSegment label="阅读方向">
            <SegmentButton
              active={readingDirection === "ltr"}
              onClick={() => setReadingDirection("ltr")}
              label="从左到右"
            />
            <SegmentButton
              active={readingDirection === "rtl"}
              onClick={() => setReadingDirection("rtl")}
              label="从右到左"
            />
          </ReaderSegment>
          {pageLayout === "double" && !wideLayout && (
            <p className="layout-note">当前宽度使用单页显示，横屏后自动恢复双页。</p>
          )}
        </aside>
      )}

      {readingMode === "continuous" ? (
        <ContinuousPages
          manifest={props.manifest}
          currentPage={currentPage}
          layout={effectiveLayout}
          direction={readingDirection}
          scrollRef={scrollRef}
          galleryRef={lightbox.galleryRef}
          onPageChange={onObservedPage}
        />
      ) : (
        <PagedPages
          manifest={props.manifest}
          currentPage={currentPage}
          layout={effectiveLayout}
          direction={readingDirection}
          galleryRef={lightbox.galleryRef}
          suppressClick={suppressClick}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPrevious={() => setPage(currentPage - step)}
          onNext={() => setPage(currentPage + step)}
        />
      )}

      <footer className="comic-bottom comic-controls">
        <button
          type="button"
          disabled={!previousChapter}
          onClick={() => changeChapter(previousChapter)}
        >
          <ChevronLeft size={17} />
          上一章
        </button>
        <label>
          <span>页码</span>
          <select
            value={currentPage}
            onChange={(event) => setPage(Number(event.target.value), true)}
            aria-label="跳转页码"
          >
            {props.manifest.images.map((image, index) => (
              <option value={index} key={image.logicalAssetId}>
                {index + 1} / {props.manifest.images.length}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!nextChapter} onClick={() => changeChapter(nextChapter)}>
          下一章
          <ChevronRight size={17} />
        </button>
      </footer>
    </div>
  );
}

function ContinuousPages(props: {
  manifest: UnitImageManifest;
  currentPage: number;
  layout: "single" | "double";
  direction: "ltr" | "rtl";
  scrollRef: React.RefObject<HTMLDivElement | null>;
  galleryRef: React.RefObject<HTMLDivElement | null>;
  onPageChange: (page: number) => void;
}) {
  const ratios = useRef(new Map<number, number>());

  useEffect(() => {
    const root = props.scrollRef.current;
    const gallery = props.galleryRef.current;
    if (!root || !gallery) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.pageIndex);
          ratios.current.set(index, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        const visible = [...ratios.current.entries()].sort((left, right) => right[1] - left[1])[0];
        if (visible && visible[1] > 0) props.onPageChange(visible[0]);
      },
      { root, threshold: [0.18, 0.45, 0.72] },
    );
    gallery.querySelectorAll("[data-page-index]").forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [props.galleryRef, props.onPageChange, props.scrollRef]);

  useEffect(() => {
    const target = props.galleryRef.current?.querySelector<HTMLElement>(
      `[data-page-index="${props.currentPage}"]`,
    );
    window.requestAnimationFrame(() => target?.scrollIntoView({ block: "start" }));
  }, []);

  return (
    <div className="comic-stage continuous" ref={props.scrollRef}>
      <div
        className={`comic-pages ${props.layout}`}
        data-direction={props.direction}
        ref={props.galleryRef}
      >
        {props.manifest.images.map((image, index) => {
          const width = image.browse.width ?? 1200;
          const height = image.browse.height ?? 1680;
          const nearby = Math.abs(index - props.currentPage) <= 3;
          return (
            <article
              className={index === props.currentPage ? "comic-page current" : "comic-page"}
              data-page-index={index}
              style={{ aspectRatio: `${width} / ${height}` }}
              key={image.logicalAssetId}
            >
              <a
                href={image.browse.url}
                data-pswp-item
                data-pswp-width={width}
                data-pswp-height={height}
                target="_blank"
                rel="noreferrer"
                aria-label={`放大第 ${index + 1} 页`}
              >
                {nearby ? (
                  <ReaderImage
                    src={image.browse.url}
                    alt={`${props.manifest.unit.title} 第 ${index + 1} 页`}
                    loading={Math.abs(index - props.currentPage) <= 1 ? "eager" : "lazy"}
                  />
                ) : (
                  <span className="page-placeholder">{index + 1}</span>
                )}
              </a>
              <span className="page-number">{index + 1}</span>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PagedPages(props: {
  manifest: UnitImageManifest;
  currentPage: number;
  layout: "single" | "double";
  direction: "ltr" | "rtl";
  galleryRef: React.RefObject<HTMLDivElement | null>;
  suppressClick: React.MutableRefObject<boolean>;
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const visible = new Set([
    props.currentPage,
    ...(props.layout === "double" ? [props.currentPage + 1] : []),
  ]);
  return (
    <div
      className="comic-stage paged"
      onPointerDown={props.onPointerDown}
      onPointerUp={props.onPointerUp}
    >
      <button
        className="page-arrow previous"
        type="button"
        onClick={props.onPrevious}
        disabled={props.currentPage === 0}
        aria-label="上一页"
      >
        <ChevronLeft size={23} />
      </button>
      <div
        className={`comic-paged-pages ${props.layout}`}
        data-direction={props.direction}
        ref={props.galleryRef}
      >
        {props.manifest.images.map((image, index) => {
          const width = image.browse.width ?? 1200;
          const height = image.browse.height ?? 1680;
          const isVisible = visible.has(index);
          const visualOrder = props.direction === "rtl" ? -index : index;
          return (
            <a
              className={isVisible ? "paged-image visible" : "paged-image"}
              href={image.browse.url}
              data-pswp-item
              data-pswp-width={width}
              data-pswp-height={height}
              target="_blank"
              rel="noreferrer"
              style={{ aspectRatio: `${width} / ${height}`, order: visualOrder }}
              aria-label={`放大第 ${index + 1} 页`}
              onClick={(event) => {
                if (!props.suppressClick.current) return;
                event.preventDefault();
                props.suppressClick.current = false;
              }}
              key={image.logicalAssetId}
            >
              {isVisible && (
                <ReaderImage
                  src={image.browse.url}
                  alt={`${props.manifest.unit.title} 第 ${index + 1} 页`}
                  loading="eager"
                />
              )}
              {isVisible && <span className="page-number">{index + 1}</span>}
            </a>
          );
        })}
      </div>
      <button
        className="page-arrow next"
        type="button"
        onClick={props.onNext}
        disabled={props.currentPage >= props.manifest.images.length - 1}
        aria-label="下一页"
      >
        <ChevronRight size={23} />
      </button>
    </div>
  );
}

function ReaderSegment(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="reader-segment">
      <span>{props.label}</span>
      <div>{props.children}</div>
    </div>
  );
}

function SegmentButton(props: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <button className={props.active ? "active" : ""} type="button" onClick={props.onClick}>
      {props.icon}
      {props.label}
    </button>
  );
}

function ComicState(props: {
  title: string;
  label: string;
  onClose: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="comic-reader" role="dialog" aria-modal="true">
      <header className="comic-top">
        <button
          className="reader-icon"
          type="button"
          onClick={props.onClose}
          aria-label="返回作品目录"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <strong>{props.title}</strong>
          <span>漫画阅读</span>
        </div>
        <span />
      </header>
      <div className="reader-state">
        {props.onRetry ? (
          <strong>章节暂未载入</strong>
        ) : (
          <LoaderCircle className="spin" size={24} />
        )}
        <span>{props.label}</span>
        {props.onRetry && (
          <button type="button" onClick={props.onRetry}>
            <RotateCcw size={15} />
            重新加载
          </button>
        )}
      </div>
    </div>
  );
}

function useWideLayout() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 760px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 760px)");
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}
