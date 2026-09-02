import { useCallback, useEffect, useRef } from "react";
import PhotoSwipeLightbox from "photoswipe/lightbox";

export function usePhotoSwipe(input: { itemKey: string; onChange?: (index: number) => void }) {
  const galleryRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null);

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;
    const lightbox = new PhotoSwipeLightbox({
      gallery,
      children: "a[data-pswp-item]",
      pswpModule: () => import("photoswipe"),
      bgOpacity: 0.96,
      showHideAnimationType: "fade",
      errorMsg:
        '<div class="pswp__error-msg"><p>图片加载失败</p><button type="button" data-pswp-retry>重新加载</button></div>',
    });
    const retry = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-pswp-retry]")) return;
      const pswp = lightbox.pswp;
      if (pswp) pswp.refreshSlideContent(pswp.currIndex);
    };
    lightbox.on("change", () => {
      if (lightbox.pswp) input.onChange?.(lightbox.pswp.currIndex);
    });
    lightbox.on("afterInit", () => document.addEventListener("click", retry));
    lightbox.on("close", () => document.removeEventListener("click", retry));
    lightbox.init();
    lightboxRef.current = lightbox;
    return () => {
      document.removeEventListener("click", retry);
      lightbox.destroy();
      lightboxRef.current = null;
    };
  }, [input.itemKey, input.onChange]);

  const openAt = useCallback((index: number) => {
    lightboxRef.current?.loadAndOpen(index);
  }, []);

  return { galleryRef, openAt };
}
