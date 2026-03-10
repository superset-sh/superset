import * as React from "react";
import { cn } from "../../../lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface NotionCalendarMiniProps extends React.HTMLAttributes<HTMLDivElement> {
  currentMonthText?: string;
  days?: { date: number; fullDate?: Date; isCurrentMonth: boolean; isToday: boolean }[];
  weekdays?: string[];
  visibleDates?: Set<string>;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onDayClick?: (date: Date) => void;
}

export const NotionCalendarMini = React.forwardRef<HTMLDivElement, NotionCalendarMiniProps>(
  (
    {
      className,
      currentMonthText = "2026 2월",
      days = [],
      weekdays = ["일", "월", "화", "수", "목", "금", "토"],
      visibleDates,
      onPrevMonth,
      onNextMonth,
      onDayClick,
      ...props
    },
    ref
  ) => {
    return (
      <div ref={ref} className={cn("w-full select-none text-[11px]", className)} {...props}>
        {/* Header */}
        <div className="flex items-center justify-between mb-1.5 pl-1 pr-0.5">
          <span className="font-semibold text-foreground text-[11px]">{currentMonthText}</span>
          <div className="flex items-center gap-0.5 text-muted-foreground">
            <button
              onClick={onPrevMonth}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onNextMonth}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Weekdays */}
        <div className="grid grid-cols-7 mb-0.5 text-center text-muted-foreground/70 text-[10px] font-medium">
          {weekdays.map((day) => (
            <div key={day} className="py-0.5">
              {day}
            </div>
          ))}
        </div>

        {/* Helper: format a Date to YYYY-MM-DD */}
        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-y-0.5 text-center">
          {days.length > 0 ? (
            days.map((day, i) => {
              const dateStr = day.fullDate
                ? `${day.fullDate.getFullYear()}-${String(day.fullDate.getMonth() + 1).padStart(2, '0')}-${String(day.fullDate.getDate()).padStart(2, '0')}`
                : '';
              const isInView = !!(visibleDates && dateStr && visibleDates.has(dateStr));
              return (
                <button
                  key={i}
                  onClick={() => day.fullDate && onDayClick?.(day.fullDate)}
                  className={cn(
                    "relative flex items-center justify-center h-6 w-6 mx-auto rounded-full transition-colors text-[11px]",
                    "hover:bg-muted hover:text-foreground",
                    !day.isCurrentMonth && "text-muted-foreground hover:text-muted-foreground",
                    day.isCurrentMonth && "text-foreground",
                    day.isToday && "bg-red-500 text-white hover:bg-red-600 hover:text-white font-semibold",
                  )}
                  style={isInView && !day.isToday ? { backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: '4px' } : undefined}
                >
                  {day.date}
                </button>
              );
            })
          ) : (
            // Placeholder for empty state
            <div className="col-span-7 py-4 text-muted-foreground text-center">
              No dates provided
            </div>
          )}
        </div>
      </div>
    );
  }
);
NotionCalendarMini.displayName = "NotionCalendarMini";
