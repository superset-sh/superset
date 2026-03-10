import { useState, useRef, useCallback } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { ArrowUp, Square } from "lucide-react";

interface Props {
  onSend: (message: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;

    onSend(trimmed);
    setValue("");

    // 포커스 유지
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
    <div className="border-t bg-background p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요..."
          disabled={disabled}
          rows={1}
          className="min-h-[44px] max-h-[200px] resize-none"
        />
        {isStreaming ? (
          <Button
            size="icon-sm"
            variant="outline"
            onClick={onStop}
            aria-label="중지"
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            size="icon-sm"
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            aria-label="전송"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
