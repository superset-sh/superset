import { useState } from "react";
import { type ScrollAreaRootProps } from "@base-ui/react/scroll-area";
import { useRouter } from "@tanstack/react-router";
import { DynamicIcon } from "lucide-react/dynamic";
import { ScrollArea } from "../../_shadcn/scroll-area";
import { cn } from "../../lib/utils";
import { usePullToRefresh } from "../../hooks/use-pull-to-refresh";

const PTR_THRESHOLD = 80;
const PTR_MAX_DISTANCE = 120;

interface Props {
  className?: string;
  children: React.ReactNode;
}

export function PullToRefresh({ className, children }: Props) {
  const router = useRouter();

  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);

  const { mode, pullDistance } = usePullToRefresh({
    container,
    viewport,
    threshold: PTR_THRESHOLD,
    maxDistance: PTR_MAX_DISTANCE,
    onRefresh: router.invalidate,
  });

  const handleScrollAreaRef = (container: HTMLDivElement | null) => {
    const viewport =
      container?.querySelector<HTMLDivElement>("[data-slot='scroll-area-viewport']") ?? null;

    setContainer(container);
    setViewport(viewport);
  };

  return (
    <ScrollArea
      // NOTE: ScrollArea 컴포넌트가 ref를 사용하지 않지만, props spread로 ref는 런타임에서 전달됨
      {...({
        ref: handleScrollAreaRef,
      } as ScrollAreaRootProps)}
      style={{
        transform: `translateY(${pullDistance}px)`,
      }}
      className={cn(
        className,
        "overscroll-none transition-transform duration-200 ease-out data-[state=pulling]:transition-none",
        "**:data-[slot='scroll-area-scrollbar']:hidden **:data-[slot='scroll-area-viewport']:overscroll-none",
      )}
      data-state={mode}
    >
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        refreshing={mode === "refreshing"}
        threshold={PTR_THRESHOLD}
      />
      {children}
    </ScrollArea>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  threshold: number;
  refreshing: boolean;
}

function PullToRefreshIndicator({
  pullDistance,
  threshold,
  refreshing,
}: PullToRefreshIndicatorProps) {
  const visible = pullDistance > 0 || refreshing;
  const progress = Math.min(pullDistance / threshold, 1);
  const thresholdReached = pullDistance >= threshold;

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-label={refreshing ? "Refreshing" : "Pull to refresh"}
      style={{
        top: `-${pullDistance}px`,
        height: `${pullDistance}px`,
      }}
      className="absolute inset-x-0 z-50 flex items-center justify-center"
    >
      <div className="bg-background flex size-8 items-center justify-center rounded-full shadow-md transition-all duration-200 ease-out">
        {refreshing ? (
          <DynamicIcon name="loader-circle" className="text-primary size-4" />
        ) : (
          <DynamicIcon
            name="arrow-down"
            className="text-muted-foreground data-[reached=true]:text-primary size-4 transition-transform duration-200"
            style={{
              opacity: progress,
              transform: `rotate(${thresholdReached ? 360 : progress * 360}deg)`,
            }}
            data-reached={thresholdReached}
          />
        )}
      </div>
    </div>
  );
}
