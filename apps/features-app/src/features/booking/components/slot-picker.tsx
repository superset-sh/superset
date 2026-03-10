/**
 * Slot Picker
 *
 * 날짜/시간 슬롯 선택 컴포넌트
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface AvailableSlot {
  date: string;
  startTime: string;
  endTime: string;
  available: boolean;
}

interface Props {
  slots: AvailableSlot[];
  isLoading: boolean;
  selectedDate: string;
  selectedTime: string | null;
  onDateChange: (date: string) => void;
  onTimeSelect: (time: string) => void;
  className?: string;
}

export function SlotPicker({
  slots,
  isLoading,
  selectedDate,
  selectedTime,
  onDateChange,
  onTimeSelect,
  className,
}: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const dates = getWeekDates(weekOffset);

  return (
    <div className={cn("space-y-6", className)}>
      {/* 날짜 선택 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">날짜 선택</h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
              disabled={weekOffset === 0}
            >
              <ChevronLeft className="size-4" />
              <span className="sr-only">이전 주</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWeekOffset(weekOffset + 1)}
              disabled={weekOffset >= 3}
            >
              <ChevronRight className="size-4" />
              <span className="sr-only">다음 주</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {dates.map((date) => {
            const dateStr = formatDateString(date);
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === formatDateString(new Date());

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onDateChange(dateStr)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg p-3 text-sm transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/50",
                  isToday && !isSelected && "ring-1 ring-primary/30",
                )}
              >
                <span className="text-sm text-muted-foreground">
                  {WEEKDAY_LABELS[date.getDay()]}
                </span>
                <span className="text-base font-medium">{date.getDate()}</span>
                <span className="text-sm text-muted-foreground">
                  {date.getMonth() + 1}월
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 시간 선택 */}
      <div className="space-y-3">
        <h3 className="text-lg font-medium">시간 선택</h3>

        {isLoading ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            선택한 날짜에 예약 가능한 시간이 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {slots.map((slot) => {
              const isSelected = slot.startTime === selectedTime;
              return (
                <button
                  key={slot.startTime}
                  type="button"
                  onClick={() => slot.available && onTimeSelect(slot.startTime)}
                  disabled={!slot.available}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    slot.available
                      ? isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 hover:bg-muted"
                      : "bg-muted/30 text-muted-foreground/50 cursor-not-allowed",
                  )}
                >
                  {slot.startTime}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function getWeekDates(weekOffset: number): Date[] {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() + weekOffset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date;
  });
}

function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
