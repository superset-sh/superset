/**
 * Progress Tracker Hook
 * 10초 디바운스로 비디오 진행률을 서버에 전송
 */
import { useCallback, useRef } from "react";
import { useUpdateProgress } from "./use-enrollment";

interface ProgressTrackerOptions {
  lessonId: string;
  totalDuration: number;
  debounceMs?: number;
}

export function useProgressTracker({
  lessonId,
  totalDuration,
  debounceMs = 10_000,
}: ProgressTrackerOptions) {
  const updateProgress = useUpdateProgress();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<number>(0);

  const sendProgress = useCallback(
    (currentPosition: number) => {
      if (!lessonId || totalDuration <= 0) return;

      updateProgress.mutate({
        lessonId,
        currentPosition: Math.floor(currentPosition),
        totalDuration: Math.floor(totalDuration),
      });
      lastSentRef.current = currentPosition;
    },
    [lessonId, totalDuration, updateProgress],
  );

  const trackProgress = useCallback(
    (currentPosition: number) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        sendProgress(currentPosition);
      }, debounceMs);
    },
    [debounceMs, sendProgress],
  );

  const flush = useCallback(
    (currentPosition: number) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      sendProgress(currentPosition);
    },
    [sendProgress],
  );

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { trackProgress, flush, cleanup };
}
