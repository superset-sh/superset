/**
 * ReactionBar Component
 *
 * 이모지 리액션 바 (여러 타입 선택 가능)
 */
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superbuilder/feature-ui/shadcn/popover";
import { SmilePlus } from "lucide-react";
import type { ReactionCounts, ReactionType } from "@superbuilder/features-server/reaction/types";

export interface ReactionBarProps {
  /** 타입별 리액션 카운트 */
  counts: ReactionCounts["byType"];
  /** 사용자가 선택한 리액션 타입들 */
  userTypes: ReactionType[];
  /** 리액션 토글 핸들러 */
  onToggle: (type: ReactionType) => void;
  /** 로딩 상태 */
  loading?: boolean;
  /** 비활성화 */
  disabled?: boolean;
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

const REACTION_LABELS: Record<ReactionType, string> = {
  like: "좋아요",
  love: "사랑해요",
  haha: "웃겨요",
  wow: "놀라워요",
  sad: "슬퍼요",
  angry: "화나요",
};

export function ReactionBar({
  counts,
  userTypes,
  onToggle,
  loading = false,
  disabled = false,
  className,
}: ReactionBarProps) {
  const hasReactions = counts.length > 0;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* 기존 리액션 표시 */}
      {hasReactions && (
        <div className="flex items-center gap-1">
          {counts.map(({ type, count }) => (
            <Button
              key={type}
              variant={userTypes.includes(type) ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-sm"
              onClick={() => onToggle(type)}
              disabled={disabled || loading}
            >
              <span className="mr-1">{REACTION_EMOJIS[type]}</span>
              <span>{count}</span>
            </Button>
          ))}
        </div>
      )}

      {/* 리액션 추가 버튼 */}
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="sm" className="h-7 px-2" disabled={disabled || loading}>
              <SmilePlus className="h-4 w-4" />
            </Button>
          }
        />
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex gap-1">
            {(Object.keys(REACTION_EMOJIS) as ReactionType[]).map((type) => (
              <Button
                key={type}
                variant={userTypes.includes(type) ? "secondary" : "ghost"}
                size="sm"
                className="h-8 w-8 p-0 text-lg"
                onClick={() => {
                  onToggle(type);
                }}
                disabled={disabled || loading}
                title={REACTION_LABELS[type]}
              >
                {REACTION_EMOJIS[type]}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
