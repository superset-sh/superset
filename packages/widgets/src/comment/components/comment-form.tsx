/**
 * Comment Form - 댓글 입력 폼 (Presentational)
 */
import { Avatar, AvatarFallback, AvatarImage } from "@superbuilder/feature-ui/shadcn/avatar";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { useState } from "react";

export interface CommentFormProps {
  /** 현재 사용자 정보 */
  currentUser?: {
    id: string;
    name: string;
    avatar?: string | null;
  } | null;
  /** 답글인 경우 true */
  isReply?: boolean;
  /** 초기 내용 */
  initialContent?: string;
  /** placeholder 텍스트 */
  placeholder?: string;
  /** 로딩 상태 */
  isLoading?: boolean;
  /** 제출 핸들러 */
  onSubmit?: (content: string) => void;
  /** 취소 핸들러 (답글일 때 사용) */
  onCancel?: () => void;
}

export function CommentForm({
  currentUser,
  isReply = false,
  initialContent = "",
  placeholder,
  isLoading = false,
  onSubmit,
  onCancel,
}: CommentFormProps) {
  const [content, setContent] = useState(initialContent);
  const [isFocused, setIsFocused] = useState(isReply);

  const defaultPlaceholder = isReply ? "답글을 입력하세요..." : "댓글을 입력하세요...";
  const authorInitial = currentUser?.name?.charAt(0).toUpperCase() ?? "?";

  const handleSubmit = () => {
    if (content.trim() && onSubmit) {
      onSubmit(content.trim());
      setContent("");
      if (!isReply) {
        setIsFocused(false);
      }
    }
  };

  const handleCancel = () => {
    setContent("");
    setIsFocused(false);
    onCancel?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 비로그인 상태
  if (!currentUser) {
    return (
      <div className="bg-muted/50 rounded-lg p-4 text-center">
        <p className="text-muted-foreground text-sm">댓글을 작성하려면 로그인이 필요합니다.</p>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isReply ? "mt-2" : ""}`}>
      <Avatar className={isReply ? "h-6 w-6" : "h-8 w-8"}>
        {currentUser.avatar ? <AvatarImage src={currentUser.avatar} /> : null}
        <AvatarFallback className={isReply ? "text-xs" : "text-sm"}>
          {authorInitial}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? defaultPlaceholder}
          className={`min-h-[40px] resize-none transition-all ${
            isFocused ? "min-h-[80px]" : ""
          }`}
          disabled={isLoading}
        />

        {isFocused ? (
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isLoading}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!content.trim() || isLoading}
            >
              {isLoading ? "등록 중..." : "등록"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
