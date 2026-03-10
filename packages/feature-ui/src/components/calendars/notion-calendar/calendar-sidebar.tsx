import * as React from "react";
import { cn } from "../../../lib/utils";

interface NotionCalendarSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: number;
}

export const NotionCalendarSidebar = React.forwardRef<HTMLDivElement, NotionCalendarSidebarProps>(
  ({ className, width = 240, children, style, ...props }, ref) => {
    return (
      <aside
        ref={ref}
        className={cn(
          "flex flex-col shrink-0 border-r border-border/40 bg-background",
          className
        )}
        style={{ width, ...style }}
        {...props}
      >
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {children}
        </div>
      </aside>
    );
  }
);
NotionCalendarSidebar.displayName = "NotionCalendarSidebar";
