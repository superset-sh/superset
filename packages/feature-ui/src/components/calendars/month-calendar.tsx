/**
 * MonthCalendar - 월간 캘린더 뷰
 *
 * Google Calendar 스타일의 월 그리드 캘린더.
 * 이벤트 렌더링, 오늘 강조, "+N 더 보기" 등 지원.
 */
import { useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "../../lib/utils";

export interface CalendarEvent {
  id: string;
  date: string | Date;
  [key: string]: unknown;
}

interface Props<T extends CalendarEvent> {
  events: T[];
  isLoading: boolean;
  currentDate: Date;
  onMonthChange: (date: Date) => void;
  onDayClick: (dateStr: string) => void;
  /** 각 이벤트의 커스텀 렌더링 (미지정 시 기본 dot) */
  renderEvent?: (event: T) => ReactNode;
  /** 날짜 셀에 표시할 최대 이벤트 수 (기본 3) */
  maxVisibleEvents?: number;
  /** 이벤트 클릭 콜백 */
  onEventClick?: (event: T) => void;
  /** "+N 더 보기" 클릭 콜백 */
  onMoreClick?: (dateStr: string, events: T[]) => void;
  className?: string;
}

export function MonthCalendar<T extends CalendarEvent>({
  events,
  isLoading,
  currentDate,
  onMonthChange,
  onDayClick,
  renderEvent,
  maxVisibleEvents = 3,
  onEventClick,
  onMoreClick,
  className,
}: Props<T>) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const days: CalendarDay<T>[] = [];

    // 이전 달 빈칸
    for (let i = 0; i < startPad; i++) {
      days.push({ date: null, dateStr: null, dayOfWeek: i, events: [] });
    }

    // 현재 달
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dow = (startPad + d - 1) % 7;
      const dayEvents = events.filter((e) => {
        const sd =
          typeof e.date === "string"
            ? e.date.slice(0, 10)
            : e.date.toISOString().slice(0, 10);
        return sd === dateStr;
      });
      days.push({ date: d, dateStr, dayOfWeek: dow, events: dayEvents });
    }

    return days;
  }, [year, month, events]);

  const todayStr = formatDateStr(new Date());

  const prevMonth = () => onMonthChange(new Date(year, month - 1, 1));
  const nextMonth = () => onMonthChange(new Date(year, month + 1, 1));

  if (isLoading) {
    return <CalendarSkeleton />;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium flex items-center gap-2">
          <CalendarDays className="size-5" />
          {year}년 {month + 1}월
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            className="inline-flex items-center justify-center size-8 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ChevronLeft className="size-4" />
            <span className="sr-only">이전 달</span>
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(new Date())}
            className="inline-flex items-center justify-center rounded-md px-3 h-8 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="inline-flex items-center justify-center size-8 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ChevronRight className="size-4" />
            <span className="sr-only">다음 달</span>
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((day, i) => (
          <div
            key={day}
            className={cn(
              "text-center text-sm font-medium py-2",
              i === 0
                ? "text-red-500"
                : i === 6
                  ? "text-blue-500"
                  : "text-muted-foreground",
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-px bg-border/30 rounded-lg overflow-hidden">
        {calendarDays.map((day, i) => {
          const isToday = day.dateStr === todayStr;
          const hasEvents = day.events.length > 0;
          const overflowCount = day.events.length - maxVisibleEvents;

          return (
            <div
              key={i}
              className={cn(
                "min-h-[80px] lg:min-h-[100px] bg-background p-1.5 transition-colors",
                day.date !== null && "hover:bg-muted/30 cursor-pointer",
                day.date === null && "bg-muted/10",
              )}
              onClick={() => day.dateStr && onDayClick(day.dateStr)}
            >
              {day.date !== null && (
                <>
                  {/* 날짜 숫자 — Google Calendar 스타일 원형 강조 */}
                  <div className="flex justify-center mb-1">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center size-7 rounded-full text-sm",
                        isToday
                          ? "bg-primary text-primary-foreground font-bold"
                          : day.dayOfWeek === 0
                            ? "text-red-500"
                            : day.dayOfWeek === 6
                              ? "text-blue-500"
                              : "text-muted-foreground",
                      )}
                    >
                      {day.date}
                    </span>
                  </div>

                  {/* 이벤트 목록 */}
                  {hasEvents && (
                    <div className="space-y-0.5">
                      {day.events
                        .slice(0, maxVisibleEvents)
                        .map((event) => (
                          <div
                            key={event.id}
                            onClick={
                              onEventClick
                                ? (e) => {
                                    e.stopPropagation();
                                    onEventClick(event);
                                  }
                                : undefined
                            }
                          >
                            {renderEvent ? (
                              renderEvent(event)
                            ) : (
                              <div className="size-1.5 rounded-full bg-primary mx-auto" />
                            )}
                          </div>
                        ))}

                      {/* "+N 더 보기" */}
                      {overflowCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onMoreClick && day.dateStr) {
                              onMoreClick(day.dateStr, day.events);
                            } else if (day.dateStr) {
                              onDayClick(day.dateStr);
                            }
                          }}
                          className="w-full text-left text-sm text-primary hover:text-primary/80 pl-1 transition-colors"
                        >
                          +{overflowCount}건 더 보기
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function CalendarSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 rounded-md bg-muted animate-pulse" />
        <div className="h-8 w-28 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden">
        {Array.from({ length: 35 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[80px] lg:min-h-[100px] bg-muted animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

/** Date → "YYYY-MM-DD" */
export function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 월의 시작 날짜 (YYYY-MM-DD) */
export function getMonthStart(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** 월의 마지막 날짜 (YYYY-MM-DD) */
export function getMonthEnd(date: Date): string {
  const y = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(y, month + 1, 0).getDate();
  const m = String(month + 1).padStart(2, "0");
  return `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface CalendarDay<T> {
  date: number | null;
  dateStr: string | null;
  dayOfWeek: number;
  events: T[];
}
