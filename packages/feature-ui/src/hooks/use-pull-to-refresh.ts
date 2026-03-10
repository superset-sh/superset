import { useState } from "react";
import { isNil } from "es-toolkit";
import { useAsync } from "./use-async";
import { useEventListener } from "./use-event-listener";

const PULL_RESISTANCE = 0.5;

interface UsePullToRefreshOptions {
  container: HTMLElement | null;
  viewport: HTMLElement | null;
  threshold: number;
  maxDistance: number;
  onRefresh: () => Promise<void>;
}

export function usePullToRefresh({
  container,
  viewport,
  threshold,
  maxDistance,
  onRefresh = () => Promise.resolve(),
}: UsePullToRefreshOptions) {
  const [state, setState] = useState(initializeState());

  const refresh = useAsync(onRefresh, {
    onFinally: () => {
      setState(initializeState());
    },
  });

  const handleTouchStart = (e: TouchEvent) => {
    if (isNil(viewport) || state.mode !== "idle") return;

    const topped = viewport.scrollTop <= 0;
    if (!topped) return;

    const touch = e.touches[0];
    if (!touch) return;
    const startY = touch.clientY;
    setState({
      mode: "pulling",
      initialY: startY,
      currentY: startY,
    });
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (isNil(viewport)) return;

    const scrollable = viewport.scrollHeight > viewport.clientHeight;
    const topped = viewport.scrollTop <= 0;

    if (!scrollable && topped && e.cancelable) {
      e.preventDefault();
    }

    if (state.mode !== "pulling") return;

    const moveTouch = e.touches[0];
    if (!moveTouch) return;
    const { clientY } = moveTouch;
    const deltaY = clientY - state.initialY;

    if (deltaY <= 0 || viewport.scrollTop > 0) {
      setState(initializeState());
      return;
    }

    if (e.cancelable) {
      e.preventDefault();
    }

    setState((prev) => ({
      ...prev,
      currentY: clientY,
    }));
  };

  const handleTouchEnd = () => {
    if (state.mode === "pulling") {
      const deltaY = state.currentY - state.initialY;
      const dist = Math.min(deltaY * PULL_RESISTANCE, maxDistance);

      if (dist >= threshold) {
        setState((prev) => ({
          ...prev,
          mode: "refreshing",
        }));
        refresh.execute();
      } else {
        setState(initializeState());
      }
    }
  };

  useEventListener(container, "touchstart", handleTouchStart, {
    passive: true,
  });
  useEventListener(container, "touchmove", handleTouchMove, {
    passive: false,
  });
  useEventListener(container, "touchend", handleTouchEnd, {
    passive: true,
  });

  const pullDistance = (() => {
    if (state.mode === "refreshing") {
      return threshold;
    }
    if (state.mode === "pulling") {
      const deltaY = state.currentY - state.initialY;
      return Math.min(deltaY * PULL_RESISTANCE, maxDistance);
    }
    return 0;
  })();

  return {
    mode: state.mode,
    pullDistance,
  };
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function initializeState(): PullState {
  return {
    mode: "idle",
    initialY: 0,
    currentY: 0,
  };
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface PullState {
  mode: "idle" | "pulling" | "refreshing";
  initialY: number;
  currentY: number;
}
