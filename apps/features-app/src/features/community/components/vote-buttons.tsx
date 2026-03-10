import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { ArrowDown, ArrowUp } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
  const prefersReducedMotion = useReducedMotion();

  const handleVote = (vote: 1 | -1) => {
    voteMutation.mutate({
      targetType,
      targetId,
      vote,
    });
  };

  const scoreColor =
    voteScore > 0 ? "text-orange-500" : voteScore < 0 ? "text-blue-500" : "text-muted-foreground";

  return (
    <motion.div
      animate={
        voteMutation.isError && !prefersReducedMotion ? { x: [0, -4, 4, -2, 2, 0] } : { x: 0 }
      }
      transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
      className={cn("flex items-center gap-1", className)}
    >
      <Button
        size={size === "sm" ? "icon-xs" : size === "lg" ? "icon-lg" : "icon-sm"}
        variant={userVote === 1 ? "default" : "ghost"}
        onClick={() => handleVote(1)}
        className={cn(userVote === 1 && "text-orange-500 hover:text-orange-600")}
        aria-label="Upvote"
      >
        <ArrowUp className={cn(size === "sm" && "size-3", size === "lg" && "size-5")} />
      </Button>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={voteScore}
          initial={prefersReducedMotion ? false : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0, y: 12 }}
          transition={{ duration: 0.15 }}
          className={cn(
            "min-w-[2rem] text-center font-semibold tabular-nums",
            scoreColor,
            size === "sm" && "text-xs",
            size === "lg" && "text-lg",
          )}
        >
          {voteScore > 0 && "+"}
          {voteScore}
        </motion.span>
      </AnimatePresence>

      <Button
        size={size === "sm" ? "icon-xs" : size === "lg" ? "icon-lg" : "icon-sm"}
        variant={userVote === -1 ? "default" : "ghost"}
        onClick={() => handleVote(-1)}
        className={cn(userVote === -1 && "text-blue-500 hover:text-blue-600")}
        aria-label="Downvote"
      >
        <ArrowDown className={cn(size === "sm" && "size-3", size === "lg" && "size-5")} />
      </Button>
    </motion.div>
  );
}
