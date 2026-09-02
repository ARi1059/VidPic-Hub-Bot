import { useCallback, useEffect, useRef } from "react";
import type { SaveReadingProgressRequest } from "@film-bot/contracts";

import { miniAppApi } from "../api.js";

interface ProgressSettings {
  readingMode: SaveReadingProgressRequest["readingMode"];
  pageLayout: SaveReadingProgressRequest["pageLayout"];
  readingDirection: SaveReadingProgressRequest["readingDirection"];
}

export function useReadingProgress(input: {
  unitId: string;
  progressType: SaveReadingProgressRequest["progressType"];
  totalPages: number;
  settings: ProgressSettings;
  onError?: (error: unknown) => void;
  onSaved?: () => void;
}) {
  const { unitId, progressType, totalPages, settings } = input;
  const pending = useRef<SaveReadingProgressRequest | null>(null);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);
  const onError = useRef(input.onError);
  const onSaved = useRef(input.onSaved);
  onError.current = input.onError;
  onSaved.current = input.onSaved;

  const persist = useCallback(
    (payload: SaveReadingProgressRequest) => {
      void miniAppApi
        .saveProgress(unitId, payload)
        .then(() => onSaved.current?.())
        .catch((error: unknown) => {
          if (alive.current) onError.current?.(error);
        });
    },
    [unitId],
  );

  const flush = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const payload = pending.current;
    pending.current = null;
    if (payload) persist(payload);
  }, [persist]);

  const update = useCallback(
    (currentPage: number, scrollAnchor: string | null = null) => {
      if (totalPages <= 0) return;
      pending.current = {
        progressType,
        currentPage: Math.max(0, Math.min(currentPage, totalPages - 1)),
        totalPages,
        scrollAnchor,
        readingMode: settings.readingMode,
        pageLayout: settings.pageLayout,
        readingDirection: settings.readingDirection,
        idempotencyKey: crypto.randomUUID(),
      };
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 650);
    },
    [
      flush,
      progressType,
      settings.pageLayout,
      settings.readingDirection,
      settings.readingMode,
      totalPages,
    ],
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [flush]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      flush();
    };
  }, [flush]);

  return { update, flush };
}
