/**
 * ReactionButton Component
 *
 * 단일 리액션 버튼 (좋아요)
 */
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Heart } from "lucide-react";

export interface ReactionButtonProps {
  /** 리액션 수 */
  count: number;
  /** 활성 상태 (사용자가 리액션했는지) */
  active?: boolean;
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 로딩 상태 */
  loading?: boolean;
  /** 비활성화 */
  disabled?: boolean;
  /** 크기 */
  size?: "sm" | "default" | "lg";
  /** 추가 클래스 */
  className?: string;
}

export function ReactionButton({
  count,
  active = false,
  onClick,
  loading = false,
  disabled = false,
  size = "default",
  className,
}: ReactionButtonProps) {
  const sizeClasses = {
    sm: "h-8 px-2 text-sm",
    default: "h-9 px-3",
    lg: "h-10 px-4",
  };

  const iconSizes = {
    sm: "h-3.5 w-3.5",
    default: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(sizeClasses[size], className)}
    >
      <Heart className={cn(iconSizes[size], "mr-1.5", active && "fill-current")} />
      {count > 0 && <span>{count}</span>}
    </Button>
  );
}
