/**
 * CalendarEventChip - 캘린더 이벤트 칩 컴포넌트
 *
 * MonthCalendar, DayTimeline 등 캘린더 컴포넌트에서 사용하는
 * Google Calendar 스타일의 이벤트 표시 칩.
 */
import { cn } from "../../lib/utils";

export type EventChipColor =
  | "default"
  | "blue"
  | "green"
  | "yellow"
  | "red"
  | "purple";

interface Props {
  /** 칩에 표시할 텍스트 */
  label: string;
  /** 시작 시간 (표시 시 앞에 추가, "HH:MM") */
  startTime?: string;
  /** 칩 색상 variant */
  color?: EventChipColor;
  /** 클릭 핸들러 */
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export function CalendarEventChip({
  label,
  startTime,
  color = "default",
  onClick,
  className,
}: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn(
        "w-full text-left text-sm truncate rounded px-1.5 py-0.5 transition-colors",
        onClick && "hover:opacity-80 cursor-pointer",
        !onClick && "cursor-default",
        COLOR_MAP[color],
        className,
      )}
    >
      {startTime && <span className="font-medium">{startTime}</span>}
      {startTime && " "}
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const COLOR_MAP: Record<EventChipColor, string> = {
  default: "bg-muted text-muted-foreground",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  green:
    "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  yellow:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  purple:
    "bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300",
};
