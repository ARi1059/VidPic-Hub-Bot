import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatalogUnit, UnitImageManifest } from "@film-bot/contracts";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Images,
  LoaderCircle,
  Maximize2,
  RotateCcw,
} from "lucide-react";

import { errorMessage, miniAppApi } from "../api.js";
import { telegram } from "../telegram.js";
import { ReaderImage } from "./ReaderImage.js";
import { usePhotoSwipe } from "./usePhotoSwipe.js";
import { useReadingProgress } from "./useReadingProgress.js";

export function GalleryViewer(props: {
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
    return (
      <ReaderFrame title={props.unit.title} onClose={props.onClose}>
        <div className="reader-state">
          <LoaderCircle className="spin" size={24} />
          <span>正在载入图集</span>
        </div>
      </ReaderFrame>
    );
  }
  if (query.isError) {
    return (
      <ReaderFrame title={props.unit.title} onClose={props.onClose}>
        <div className="reader-state">
          <strong>图集暂未载入</strong>
          <span>{errorMessage(query.error)}</span>
          <button type="button" onClick={() => void query.refetch()}>
            <RotateCcw size={15} />
            重新加载
          </button>
        </div>
      </ReaderFrame>
    );
  }
  return <GalleryContent {...props} manifest={query.data} />;
}

function GalleryContent(props: {
  unit: CatalogUnit;
  siblings: CatalogUnit[];
  manifest: UnitImageManifest;
  onUnitChange: (unit: CatalogUnit) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const initialPage = Math.min(
    props.manifest.progress?.currentPage ?? 0,
    Math.max(0, props.manifest.images.length - 1),
  );
  const [currentPage, setCurrentPage] = useState(initialPage);
  const settings = useMemo(
    () => ({
      readingMode: "paged" as const,
      pageLayout: "single" as const,
      readingDirection: "ltr" as const,
    }),
    [],
  );
  const { update: updateProgress, flush: flushProgress } = useReadingProgress({
    unitId: props.unit.id,
    progressType: "gallery",
    totalPages: props.manifest.images.length,
    settings,
    onError: (error) => props.onError(errorMessage(error)),
    onSaved: () => void queryClient.invalidateQueries({ queryKey: ["history"] }),
  });
  const handleChange = useCallback(
    (index: number) => {
      setCurrentPage(index);
      updateProgress(index, `image-${index}`);
    },
    [updateProgress],
  );
  const itemKey = props.manifest.images.map((image) => image.logicalAssetId).join(":");
  const lightbox = usePhotoSwipe({ itemKey, onChange: handleChange });
  const siblingIndex = props.siblings.findIndex((item) => item.id === props.unit.id);
  const previous = props.siblings[siblingIndex - 1];
  const next = props.siblings[siblingIndex + 1];

  const changeUnit = (unit: CatalogUnit | undefined) => {
    if (!unit) return;
    flushProgress();
    props.onUnitChange(unit);
  };

  return (
    <div className="gallery-reader" role="dialog" aria-modal="true">
      <header className="gallery-header">
        <button
          className="reader-icon"
          type="button"
          onClick={props.onClose}
          aria-label="返回作品详情"
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
          onClick={() => lightbox.openAt(currentPage)}
          aria-label="全屏查看当前图片"
          title="全屏查看"
        >
          <Maximize2 size={19} />
        </button>
      </header>

      <main className="gallery-content">
        <div className="reader-intro">
          <div>
            <span>IMAGE SET</span>
            <h1>{props.unit.title}</h1>
            <p>{props.manifest.images.length} 张图片</p>
          </div>
          {props.manifest.progress && (
            <button type="button" onClick={() => lightbox.openAt(initialPage)}>
              继续第 {initialPage + 1} 张
              <ChevronRight size={16} />
            </button>
          )}
        </div>

        {props.manifest.images.length > 0 ? (
          <div className="thumbnail-grid" ref={lightbox.galleryRef}>
            {props.manifest.images.map((image, index) => {
              const width = image.browse.width ?? 1600;
              const height = image.browse.height ?? 1200;
              return (
                <a
                  href={image.browse.url}
                  data-pswp-item
                  data-pswp-width={width}
                  data-pswp-height={height}
                  target="_blank"
                  rel="noreferrer"
                  style={{ aspectRatio: `${width} / ${height}` }}
                  aria-label={`查看第 ${index + 1} 张图片`}
                  key={image.logicalAssetId}
                >
                  <ReaderImage
                    src={image.thumbnail?.url ?? image.browse.url}
                    alt={`${props.unit.title} 第 ${index + 1} 张`}
                    loading={index < 4 ? "eager" : "lazy"}
                  />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <Images size={16} />
                </a>
              );
            })}
          </div>
        ) : (
          <div className="reader-state">
            <Images size={23} />
            <strong>图集中还没有可浏览图片</strong>
          </div>
        )}

        <nav className="set-navigation" aria-label="图集切换">
          <button type="button" disabled={!previous} onClick={() => changeUnit(previous)}>
            <ChevronLeft size={17} />
            <span>
              <small>上一套</small>
              <strong>{previous?.title ?? "已经是第一套"}</strong>
            </span>
          </button>
          <button type="button" disabled={!next} onClick={() => changeUnit(next)}>
            <span>
              <small>下一套</small>
              <strong>{next?.title ?? "已经是最后一套"}</strong>
            </span>
            <ChevronRight size={17} />
          </button>
        </nav>
      </main>
    </div>
  );
}

function ReaderFrame(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="gallery-reader" role="dialog" aria-modal="true">
      <header className="gallery-header">
        <button
          className="reader-icon"
          type="button"
          onClick={props.onClose}
          aria-label="返回作品详情"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <strong>{props.title}</strong>
          <span>图片浏览</span>
        </div>
        <span />
      </header>
      {props.children}
    </div>
  );
}
