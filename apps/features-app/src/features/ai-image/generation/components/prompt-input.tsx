import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Sparkles, Loader2 } from "lucide-react";

interface Props {
  onSubmit: (prompt: string) => void;
  isGenerating: boolean;
  defaultPrompt?: string;
  disabled?: boolean;
}

export function PromptInput({ onSubmit, isGenerating, defaultPrompt = "", disabled }: Props) {
  const [prompt, setPrompt] = useState(defaultPrompt);

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating || disabled) return;
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="생성하고 싶은 이미지를 설명해주세요..."
        className="min-h-[100px] resize-none"
        disabled={isGenerating}
        maxLength={2000}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {prompt.length}/2000
        </span>
        <Button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isGenerating || disabled}
          size="sm"
        >
          {isGenerating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {isGenerating ? "생성 중..." : "이미지 생성"}
        </Button>
      </div>
    </div>
  );
}
