/**
 * DayTimeline - 시간대 기반 가로 스크롤 타임라인
 *
 * X축: 날짜 컬럼 (가로 무한 스크롤)
 * Y축: 시간대 (startHour ~ endHour)
 * 날짜 헤더 sticky top, 시간 컬럼 sticky left, 현재 시각 인디케이터
 */
import { useRef, useEffect, useCallback, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface TimelineEvent {
  id: string;
  date: string | Date;
  startTime: string;
  endTime: string;
  [key: string]: unknown;
}

interface Props<T extends TimelineEvent> {
  events: T[];
  isLoading: boolean;
  /** 기준 날짜 */
  baseDate: string;
  /** 표시할 날짜 수 */
  dayCount: number;
  /** 하루 컬럼 폭 px (기본 200) */
  dayWidth?: number;
  /** 시간 행 높이 px (기본 80) */
  hourHeight?: number;
  /** 시작 시간 (기본 7) */
  startHour?: number;
  /** 종료 시간 (기본 23) */
  endHour?: number;
  /** 우측 끝 도달 시 추가 날짜 로드 */
  onLoadMore?: () => void;
  renderEvent: (event: T) => ReactNode;
  /** 빈 시간 슬롯 더블클릭 */
  onEmptySlotDoubleClick?: (dateStr: string, hour: number) => void;
  /** 부모에서 scrollToToday 호출용 ref */
  scrollToTodayRef?: React.MutableRefObject<(() => void) | null>;
  className?: string;
}

export function DayTimeline<T extends TimelineEvent>({
  events,
  isLoading,
  baseDate,
  dayCount,
  dayWidth = 200,
  hourHeight = 80,
  startHour = 7,
  endHour = 23,
  onLoadMore,
  renderEvent,
  onEmptySlotDoubleClick,
  scrollToTodayRef,
  className,
}: Props<T>) {
  const todayStr = toDateString(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(false);
  const initialScrollDone = useRef(false);

  const dates = getDatesFromBase(baseDate, dayCount);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const totalHoursHeight = hours.length * hourHeight;
  const totalWidth = TIME_COL_WIDTH + dates.length * dayWidth;

  // 날짜별 이벤트 그룹핑
  const eventsByDate = new Map<string, T[]>();
  for (const e of events) {
    const sd =
      typeof e.date === "string"
        ? e.date.slice(0, 10)
        : (e.date as Date).toISOString().slice(0, 10);
    const arr = eventsByDate.get(sd) ?? [];
    arr.push(e);
    eventsByDate.set(sd, arr);
  }

  // "HH:MM" → Y 위치 (px)
  const getTimeY = (time: string): number => {
    const parts = time.split(":").map(Number);
    const h = parts[0] ?? 0;
    const m = parts[1] ?? 0;
    return (h - startHour + m / 60) * hourHeight;
  };

  // 초기 마운트 시 오늘 + 9시로 스크롤
  useEffect(() => {
    if (initialScrollDone.current) return;
    const el = scrollRef.current;
    if (!el) return;

    initialScrollDone.current = true;

    const todayIdx = dates.findIndex((d) => toDateString(d) === todayStr);
    if (todayIdx >= 0) {
      const scrollX =
        TIME_COL_WIDTH +
        todayIdx * dayWidth -
        el.clientWidth / 2 +
        dayWidth / 2;
      el.scrollLeft = Math.max(0, scrollX);
    }

    const scrollY = Math.max(0, (9 - startHour) * hourHeight + BODY_TOP_OFFSET - 40);
    el.scrollTop = scrollY;
  }, [dates, todayStr, dayWidth, startHour, hourHeight]);

  // 무한 가로 스크롤
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onLoadMore) return;

    const handleScroll = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      if (
        scrollLeft + clientWidth >= scrollWidth - SCROLL_THRESHOLD &&
        !loadMoreRef.current
      ) {
        loadMoreRef.current = true;
        onLoadMore();
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [onLoadMore]);

  // dayCount 변경 시 loadMore 플래그 리셋
  useEffect(() => {
    loadMoreRef.current = false;
  }, [dayCount]);

  // "오늘" 스크롤 — 부모에서 ref로 호출 가능
  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const todayIdx = dates.findIndex((d) => toDateString(d) === todayStr);
    if (todayIdx >= 0) {
      const scrollX =
        TIME_COL_WIDTH +
        todayIdx * dayWidth -
        el.clientWidth / 2 +
        dayWidth / 2;
      el.scrollTo({ left: Math.max(0, scrollX), behavior: "smooth" });
    }
  }, [dates, todayStr, dayWidth]);

  // 부모에 scrollToToday 노출
  useEffect(() => {
    if (scrollToTodayRef) {
      scrollToTodayRef.current = scrollToToday;
    }
  }, [scrollToTodayRef, scrollToToday]);

  // 현재 시각 인디케이터 Y 위치
  const now = new Date();
  const currentTimeY =
    now.getHours() >= startHour && now.getHours() < endHour
      ? (now.getHours() - startHour + now.getMinutes() / 60) * hourHeight
      : null;

  return (
    <div className={cn("flex w-full flex-col overflow-hidden", className)}>
      <div className="flex-1 min-h-0 overflow-hidden rounded-lg border">
        <div ref={scrollRef} className="size-full overflow-auto">
          <div
            style={{
              width: totalWidth,
              height: HEADER_HEIGHT + BODY_TOP_OFFSET + totalHoursHeight,
            }}
          >
            {/* 날짜 헤더 행 (sticky top) */}
            <div
              className="sticky top-0 z-20 flex border-b bg-background"
              style={{ height: HEADER_HEIGHT }}
            >
              {/* 코너 셀 (sticky top + left) */}
              <div
                className="sticky left-0 z-30 shrink-0 border-r bg-background"
                style={{ width: TIME_COL_WIDTH }}
              />
              {/* 날짜 헤더들 */}
              {dates.map((date, idx) => {
                const dateStr = toDateString(date);
                const isToday = dateStr === todayStr;
                const dayIdx = date.getDay();
                const isFirstOfMonth = date.getDate() === 1 || idx === 0;

                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "shrink-0 flex items-center gap-2 px-3 border-r border-border/50",
                      isToday && "bg-primary/10",
                    )}
                    style={{ width: dayWidth }}
                  >
                    <span
                      className={cn(
                        "flex items-center justify-center size-7 rounded-md text-sm font-medium shrink-0",
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50",
                      )}
                    >
                      {date.getDate()}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span
                        className={cn(
                          "text-sm font-medium leading-tight",
                          dayIdx === 0
                            ? "text-red-500"
                            : dayIdx === 6
                              ? "text-blue-500"
                              : "text-foreground",
                        )}
                      >
                        {WEEKDAYS[dayIdx]}
                        {isToday && (
                          <span className="text-primary ml-1">오늘</span>
                        )}
                      </span>
                      {isFirstOfMonth && (
                        <span className="text-sm text-muted-foreground leading-tight">
                          {date.getMonth() + 1}월
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 본문: 시간 컬럼 + 날짜 컬럼들 */}
            <div className="flex" style={{ height: totalHoursHeight, marginTop: BODY_TOP_OFFSET }}>
              {/* 시간 컬럼 (sticky left) */}
              <div
                className="sticky left-0 z-10 shrink-0 border-r bg-background"
                style={{ width: TIME_COL_WIDTH }}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="relative border-b border-border/30"
                    style={{ height: hourHeight }}
                  >
                    <span className="absolute -top-2.5 right-2 text-sm text-muted-foreground leading-none">
                      {hour}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* 날짜 컬럼들 */}
              {dates.map((date) => {
                const dateStr = toDateString(date);
                const isToday = dateStr === todayStr;
                const dayEvents = isLoading
                  ? []
                  : eventsByDate.get(dateStr) ?? [];

                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "shrink-0 relative border-r border-border/50",
                      isToday && "bg-primary/5",
                    )}
                    style={{ width: dayWidth, height: totalHoursHeight }}
                  >
                    {/* 정시 그리드 라인 + 더블클릭 영역 */}
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className={cn(
                          "absolute w-full border-b border-border/30",
                          onEmptySlotDoubleClick &&
                            "cursor-pointer hover:bg-muted/30 transition-colors",
                        )}
                        style={{
                          top: (hour - startHour) * hourHeight,
                          height: hourHeight,
                        }}
                        onDoubleClick={
                          onEmptySlotDoubleClick
                            ? () => onEmptySlotDoubleClick(dateStr, hour)
                            : undefined
                        }
                      />
                    ))}

                    {/* 30분 그리드 라인 */}
                    {hours.map((hour) => (
                      <div
                        key={`${hour}-half`}
                        className="absolute w-full border-b border-dashed border-border/20 pointer-events-none"
                        style={{
                          top:
                            (hour - startHour) * hourHeight + hourHeight / 2,
                        }}
                      />
                    ))}

                    {/* 현재 시각 인디케이터 */}
                    {isToday && currentTimeY !== null && (
                      <div
                        className="absolute left-0 right-0 z-[5] pointer-events-none"
                        style={{ top: currentTimeY }}
                      >
                        <div className="flex items-center">
                          <div className="size-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                          <div className="flex-1 h-px bg-red-500" />
                        </div>
                      </div>
                    )}

                    {/* 이벤트 카드 (데이터 로딩 완료 후 표시) */}
                    {dayEvents.map((event) => {
                      const topY = Math.max(0, getTimeY(event.startTime));
                      const bottomY = Math.min(
                        totalHoursHeight,
                        getTimeY(event.endTime),
                      );
                      const height = Math.max(bottomY - topY, 20);

                      return (
                        <div
                          key={event.id}
                          className="absolute left-1 right-1 z-[3] overflow-hidden"
                          style={{ top: topY, height }}
                        >
                          {renderEvent(event)}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TIME_COL_WIDTH = 52;
const HEADER_HEIGHT = 48;
const SCROLL_THRESHOLD = 300;
/** 첫 시간 레이블(-top-2.5)이 잘리지 않도록 body 상단에 추가하는 여백 */
const BODY_TOP_OFFSET = 12;

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

/** 기준 날짜부터 count일 만큼의 Date 배열 (기준일 3일 전부터 시작) */
export function getDatesFromBase(dateStr: string, count: number): Date[] {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 3);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(d);
    date.setDate(d.getDate() + i);
    return date;
  });
}

/** Date → "YYYY-MM-DD" */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
