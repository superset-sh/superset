import * as React from "react";
import { cn } from "../../../lib/utils";
import { ChevronDown, ChevronRight, Eye, MoreHorizontal, Check } from "lucide-react";

interface CalendarItem {
  id: string;
  name: string;
  color: string;
  isVisible: boolean;
  isDefault?: boolean;
}

interface NotionCalendarEventGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  calendars?: CalendarItem[];
  onToggleVisibility?: (id: string) => void;
}

export const NotionCalendarEventGroup = React.forwardRef<HTMLDivElement, NotionCalendarEventGroupProps>(
  (
    {
      className,
      title = "내 캘린더",
      isExpanded = true,
      onToggleExpand,
      calendars = [],
      onToggleVisibility,
      ...props
    },
    ref
  ) => {
    return (
      <div ref={ref} className={cn("w-full select-none", className)} {...props}>
        {/* Header */}
        <div
          className="flex items-center justify-between py-1 px-1 rounded hover:bg-muted transition-colors cursor-pointer group"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground opacity-70 -ml-0.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-70 -ml-0.5" />
            )}
            {title}
          </div>
        </div>

        {/* List */}
        {isExpanded && (
          <div className="mt-1 flex flex-col gap-0.5 pl-5">
            {calendars.length > 0 ? (
              calendars.map((cal) => (
                <div
                  key={cal.id}
                  className="group flex items-center justify-between py-1 px-1.5 rounded hover:bg-muted transition-colors text-sm cursor-pointer"
                  onClick={() => onToggleVisibility?.(cal.id)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <div
                      className={cn(
                        "flex items-center justify-center w-3 h-3 rounded-[3px] shrink-0 border",
                        cal.isVisible ? "bg-opacity-100" : "bg-transparent"
                      )}
                      style={{
                        borderColor: cal.color,
                        backgroundColor: cal.isVisible ? cal.color : "transparent",
                      }}
                    >
                      {cal.isVisible && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    </div>
                    <span className={cn("truncate", !cal.isVisible && "text-muted-foreground")}>
                      {cal.name}
                    </span>
                    {cal.isDefault && (
                      <span className="text-[10px] text-muted-foreground px-1 bg-muted rounded">기본</span>
                    )}
                  </div>
                  
                  {/* Hover Actions */}
                  <div className="hidden group-hover:flex items-center gap-1 text-muted-foreground">
                    <button className="p-0.5 hover:bg-background rounded text-foreground transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-0.5 hover:bg-background rounded text-foreground transition-colors">
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-2 text-xs text-muted-foreground">캘린더가 없습니다.</div>
            )}
          </div>
        )}
      </div>
    );
  }
);
NotionCalendarEventGroup.displayName = "NotionCalendarEventGroup";
