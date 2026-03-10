import * as React from "react";
import { cn } from "../../../lib/utils";

interface NotionCalendarProps extends React.HTMLAttributes<HTMLDivElement> {}

export const NotionCalendar = React.forwardRef<HTMLDivElement, NotionCalendarProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex h-screen w-full overflow-hidden bg-background text-foreground font-sans",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
NotionCalendar.displayName = "NotionCalendar";
