import * as React from "react";
import { cn } from "../../../lib/utils";

interface NotionCalendarMainProps extends React.HTMLAttributes<HTMLDivElement> {}

export const NotionCalendarMain = React.forwardRef<HTMLDivElement, NotionCalendarMainProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <main
        ref={ref}
        className={cn("flex flex-1 flex-col h-full bg-background relative overflow-auto custom-scrollbar", className)}
        {...props}
      >
        {children}
      </main>
    );
  }
);
NotionCalendarMain.displayName = "NotionCalendarMain";
