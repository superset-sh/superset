import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { useVote } from "../hooks";

interface VoteButtonsProps {
  targetType: "post" | "comment";
  targetId: string;
  voteScore: number;
  upvoteCount?: number;
  downvoteCount?: number;
  userVote?: number | null;
  className?: string;
  size?: "sm" | "default" | "lg";
}

export function VoteButtons({
  targetType,
  targetId,
  voteScore,
  userVote,
  className,
  size = "default",
}: VoteButtonsProps) {
  const voteMutation = useVote();

  const handleVote = (vote: 1 | -1) => {
    voteMutation.mutate({
      targetType,
      targetId,
      vote,
    });
  };

  const scoreColor = voteScore > 0 ? "text-orange-500" : voteScore < 0 ? "text-blue-500" : "text-muted-foreground";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        size={size === "sm" ? "icon-xs" : size === "lg" ? "icon-lg" : "icon-sm"}
        variant={userVote === 1 ? "default" : "ghost"}
        onClick={() => handleVote(1)}
        className={cn(userVote === 1 && "text-orange-500 hover:text-orange-600")}
        aria-label="Upvote"
      >
        <ArrowUp className={cn(size === "sm" && "size-3", size === "lg" && "size-5")} />
      </Button>

      <span className={cn("min-w-[2rem] text-center font-semibold tabular-nums", scoreColor, size === "sm" && "text-xs", size === "lg" && "text-lg")}>
        {voteScore > 0 && "+"}
        {voteScore}
      </span>

      <Button
        size={size === "sm" ? "icon-xs" : size === "lg" ? "icon-lg" : "icon-sm"}
        variant={userVote === -1 ? "default" : "ghost"}
        onClick={() => handleVote(-1)}
        className={cn(userVote === -1 && "text-blue-500 hover:text-blue-600")}
        aria-label="Downvote"
      >
        <ArrowDown className={cn(size === "sm" && "size-3", size === "lg" && "size-5")} />
      </Button>
    </div>
  );
}
