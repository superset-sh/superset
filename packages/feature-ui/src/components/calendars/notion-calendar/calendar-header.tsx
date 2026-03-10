import * as React from "react";
import { cn } from "../../../lib/utils";
import { TimezonePicker, type TimezoneInfo } from "./timezone-picker";
import { Plus, X } from "lucide-react";

export interface CalendarDayInfo {
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  dayNumber: number;
  isToday: boolean;
  isHoliday?: boolean;
  holidayName?: string;
  isFirstOfMonth?: boolean;
}

export interface TimezoneColumn {
  label: string;
  offset: number; // Offset relative to the primary timezone (0 for primary)
}

interface NotionCalendarHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  days: CalendarDayInfo[];
  timeColumnWidth?: number;
  timezones?: TimezoneColumn[];
  visibleDayCount?: number;
  sidebarWidth?: number;
  onAddTimezone?: (tz: TimezoneInfo) => void;
  onChangeTimezone?: (index: number, tz: TimezoneInfo) => void;
  onRemoveTimezone?: (index: number) => void;
}

export const NotionCalendarHeader = React.forwardRef<HTMLDivElement, NotionCalendarHeaderProps>(
  ({
    className,
    days = [],
    timeColumnWidth = 52,
    timezones = [{ label: "GMT+9", offset: 0 }],
    visibleDayCount = 7,
    sidebarWidth = 220,
    onAddTimezone,
    onChangeTimezone,
    onRemoveTimezone,
    ...props
  }, ref) => {
    const tzWidth = timeColumnWidth * timezones.length + (onAddTimezone ? 24 : 0); // extra space for "+" button
    const colWidth = `calc((100vw - ${sidebarWidth}px - ${tzWidth}px) / ${visibleDayCount})`;

    // Picker state
    const [pickerOpen, setPickerOpen] = React.useState(false);
    const [pickerMode, setPickerMode] = React.useState<"add" | { changeIndex: number }>("add");
    const addBtnRef = React.useRef<HTMLButtonElement>(null);
    const tzContainerRef = React.useRef<HTMLDivElement>(null);

    const handleAddClick = () => {
      setPickerMode("add");
      setPickerOpen(true);
    };

    const handleTzClick = (index: number) => {
      setPickerMode({ changeIndex: index });
      setPickerOpen(true);
    };

    const handleSelect = (tz: TimezoneInfo) => {
      if (pickerMode === "add") {
        onAddTimezone?.(tz);
      } else {
        onChangeTimezone?.(pickerMode.changeIndex, tz);
      }
      setPickerOpen(false);
    };

    return (
      <div
        ref={ref}
        className={cn(
          "sticky top-0 z-50 flex shrink-0 border-b border-border/40 bg-background select-none w-max min-w-full",
          className
        )}
        style={{ height: 40 }}
        {...props}
      >
        {/* Timezone area — sticky left */}
        <div
          ref={tzContainerRef}
          className="sticky left-0 z-50 shrink-0 flex items-center border-r border-border/40 bg-background relative"
          style={{ width: tzWidth }}
        >
          {/* "+" Add Button */}
          {onAddTimezone && (
            <button
              ref={addBtnRef}
              onClick={handleAddClick}
              className="flex items-center justify-center w-6 h-full text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 transition-colors shrink-0 cursor-pointer"
              title="세계시간 추가"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}

          {/* Timezone Labels */}
          {timezones.map((tz, idx) => (
            <div
              key={`${tz.label}-${idx}`}
              className={cn(
                "flex-1 flex items-center justify-center h-full text-[10px] text-muted-foreground/70 relative group cursor-pointer hover:bg-muted/20 transition-colors",
                idx < timezones.length - 1 && "border-r border-border/30"
              )}
              style={{ width: timeColumnWidth }}
              onClick={() => handleTzClick(idx)}
            >
              <span className="truncate px-0.5">{tz.label}</span>

              {/* Remove button (only for secondary timezones, i.e. not the last/primary one) */}
              {onRemoveTimezone && idx < timezones.length - 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveTimezone(idx);
                  }}
                  className="absolute top-0.5 right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-muted/50 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted cursor-pointer"
                >
                  <X className="w-2 h-2" />
                </button>
              )}
            </div>
          ))}

          {/* Timezone Picker Popover */}
          <TimezonePicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={handleSelect}
            anchorRef={tzContainerRef}
          />
        </div>

        {/* Days Header — same line */}
        <div className="flex flex-1">
          {days.map((day) => (
             <div
               key={day.date}
               className="flex items-center justify-center border-r border-border/40 shrink-0 gap-1.5 cursor-pointer hover:bg-muted/30 transition-colors"
               style={{ width: colWidth, minWidth: "120px" }}
             >
               <span
                 className={cn(
                   "text-[11px] font-normal leading-none",
                   day.isHoliday || day.dayOfWeek === "일" ? "text-red-500/70" :
                     day.dayOfWeek === "토" ? "text-blue-500/70" : "text-muted-foreground/70"
                 )}
               >
                 {day.dayOfWeek}
               </span>

               <div
                 className={cn(
                   "flex items-center justify-center h-[22px] min-w-[22px] rounded-full text-[13px] font-medium tabular-nums px-0.5",
                   day.isToday
                     ? "bg-red-500 text-white"
                     : "text-foreground"
                 )}
               >
                 {day.dayNumber}
               </div>

              {/* Holiday badge */}
              {day.holidayName && (
                <span className="text-[9px] text-muted-foreground/60 truncate max-w-[60px]">
                  {day.holidayName}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
);
NotionCalendarHeader.displayName = "NotionCalendarHeader";

