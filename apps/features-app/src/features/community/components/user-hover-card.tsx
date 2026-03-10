import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@superbuilder/feature-ui/shadcn/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@superbuilder/feature-ui/shadcn/popover";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import type { KarmaSummary } from "../hooks/use-karma";
import { KarmaBadge } from "./karma-badge";

interface UserHoverCardProps {
  userId: string;
  username: string;
  karma?: KarmaSummary;
  children: ReactNode;
}

export function UserHoverCard({ userId: _userId, username, karma, children }: UserHoverCardProps) {
  if (!karma) {
    return <>{children}</>;
  }

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={300}
        render={<span className="cursor-pointer" />}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={8}
        className="w-56 p-3"
      >
        <div className="flex items-center gap-2">
          <Avatar size="default">
            <AvatarFallback>{username.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{username}</p>
            <KarmaBadge karma={karma.totalKarma} />
          </div>
        </div>
        <Separator className="my-2" />
        <div className="space-y-1 text-xs">
          <div className="text-muted-foreground flex justify-between">
            <span>\uAC8C\uC2DC\uAE00 \uCE74\uB974\uB9C8</span>
            <span className="text-foreground font-medium">{karma.postKarma.toLocaleString()}</span>
          </div>
          <div className="text-muted-foreground flex justify-between">
            <span>\uB313\uAE00 \uCE74\uB974\uB9C8</span>
            <span className="text-foreground font-medium">{karma.commentKarma.toLocaleString()}</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
