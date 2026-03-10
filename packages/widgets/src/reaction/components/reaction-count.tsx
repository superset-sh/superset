/**
 * ReactionCount Component
 *
 * 리액션 수 표시 (읽기 전용)
 */
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Heart } from "lucide-react";
import type { ReactionCounts, ReactionType } from "@superbuilder/features-server/reaction/types";

export interface ReactionCountProps {
  /** 리액션 카운트 */
  counts: ReactionCounts;
  /** 이모지 표시 여부 */
  showEmojis?: boolean;
  /** 아이콘 표시 여부 */
  showIcon?: boolean;
  /** 추가 클래스 */
  className?: string;
}

const REACTION_EMOJIS: Record<ReactionType, string> = {
  like: "👍",
  love: "❤️",
  haha: "😂",
  wow: "😮",
  sad: "😢",
  angry: "😠",
};

export function ReactionCount({
  counts,
  showEmojis = false,
  showIcon = true,
  className,
}: ReactionCountProps) {
  if (counts.total === 0) {
    return null;
  }

  return (
    <div className={cn("text-muted-foreground flex items-center gap-1 text-sm", className)}>
      {showEmojis && counts.byType.length > 0 ? (
        <>
          <div className="flex -space-x-1">
            {counts.byType.slice(0, 3).map(({ type }) => (
              <span key={type} className="text-base">
                {REACTION_EMOJIS[type]}
              </span>
            ))}
          </div>
          <span>{counts.total}</span>
        </>
      ) : (
        <>
          {showIcon && <Heart className="h-4 w-4" />}
          <span>{counts.total}</span>
        </>
      )}
    </div>
  );
}
