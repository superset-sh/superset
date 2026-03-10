import { useState, useRef, useCallback } from "react";
import { Button } from "../../_shadcn/button";
import { Textarea } from "../../_shadcn/textarea";
import { cn } from "../../lib/utils";
import { ArrowUp, Square } from "lucide-react";

interface Props {
  onSend: (message: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  leftSlot?: React.ReactNode;
  className?: string;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder = "메시지를 입력하세요...",
  leftSlot,
  className,
}: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;

    onSend(trimmed);
    setValue("");

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [value, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className={cn("border-t bg-background px-4 py-3", className)}>
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        {leftSlot}

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "응답 대기 중..." : placeholder}
          disabled={disabled || isStreaming}
          rows={1}
          className="min-h-[44px] max-h-[200px] resize-none"
        />

        {isStreaming ? (
          <Button
            size="icon-sm"
            variant="outline"
            onClick={onStop}
            className="shrink-0"
            aria-label="중지"
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            size="icon-sm"
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className="shrink-0"
            aria-label="전송"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
