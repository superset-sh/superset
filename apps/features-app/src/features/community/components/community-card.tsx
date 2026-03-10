import type { Community } from "@superbuilder/drizzle";
import { Avatar, AvatarFallback, AvatarImage } from "@superbuilder/feature-ui/shadcn/avatar";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";

interface CommunityCardProps {
  community: Community;
  onJoin?: () => void;
  isJoined?: boolean;
}

export function CommunityCard({ community, onJoin, isJoined }: CommunityCardProps) {
  return (
    <div className="hover:bg-muted/50 flex items-center gap-3 rounded-lg p-3 transition-colors">
      <Avatar className="size-10">
        {community.iconUrl ? <AvatarImage src={community.iconUrl} alt={community.name} /> : null}
        <AvatarFallback className="bg-muted text-foreground font-medium">
          {community.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <Link to="/c/$slug" params={{ slug: community.slug }}>
          <h3 className="cursor-pointer truncate text-sm font-medium">{community.name}</h3>
        </Link>
        <p className="text-muted-foreground line-clamp-1 text-sm">{community.description}</p>
        <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
          <Users className="size-3.5" />
          <span>{community.memberCount.toLocaleString()}</span>
        </div>
      </div>

      {onJoin && (
        <Button
          size="sm"
          variant={isJoined ? "ghost" : "outline"}
          onClick={(e) => {
            e.preventDefault();
            onJoin();
          }}
        >
          {isJoined ? "✓ 가입됨" : "가입"}
        </Button>
      )}
    </div>
  );
}
