/**
 * AgentPanel - 에디터 우측 AI 에이전트 탭
 *
 * 콘텐츠 컨텍스트 기반 AI 채팅 + 빠른 액션 프리셋.
 * SSE 스트리밍으로 텍스트가 점진적으로 표시된다.
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Sparkles, Send, Loader2, Square, FileText, Type, Wand2, ClipboardPaste } from "lucide-react";
import { useAiChatStream } from "../../hooks";

interface Props {
  studioId: string;
  contentId: string;
  title: string;
  bodyText: string;
  onApplyContent: (content: string) => void;
}

export function AgentPanel({ studioId, contentId, onApplyContent }: Props) {
  const { text, isStreaming, error, stream, cancel } = useAiChatStream();
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (customPrompt?: string) => {
    const finalPrompt = customPrompt ?? prompt.trim();
    if (!finalPrompt || isStreaming) return;
    stream({ studioId, contentId, prompt: finalPrompt });
  };

  const handlePreset = (presetPrompt: string) => {
    setPrompt(presetPrompt);
    handleSubmit(presetPrompt);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 프롬프트 입력 */}
      <div className="flex flex-col gap-2">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="AI에게 콘텐츠에 대해 질문하세요..."
          rows={3}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSubmit();
            }
          }}
        />
        {isStreaming ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={cancel}
          >
            <Square className="mr-1.5 h-3.5 w-3.5" />
            중지
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full"
            onClick={() => handleSubmit()}
            disabled={!prompt.trim()}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            실행
          </Button>
        )}
      </div>

      {/* 빠른 액션 */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">빠른 액션</span>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => handlePreset(preset.prompt)}
              disabled={isStreaming}
            >
              <preset.icon className="h-3 w-3" />
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {/* 응답 영역 */}
      <div className="flex-1">
        {error ? (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={() => handleSubmit()}
            >
              다시 시도
            </Button>
          </div>
        ) : text ? (
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {text}
              {isStreaming && <StreamingCursor />}
            </p>
            {!isStreaming && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full h-7 text-xs"
                onClick={() => onApplyContent(text)}
              >
                <ClipboardPaste className="mr-1.5 h-3 w-3" />
                본문에 적용
              </Button>
            )}
          </div>
        ) : isStreaming ? (
          <div className="rounded-md border bg-muted/30 p-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const PRESETS = [
  { label: "요약 생성", icon: FileText, prompt: "이 콘텐츠를 3줄로 요약해줘" },
  { label: "제목 추천", icon: Type, prompt: "이 콘텐츠에 대한 제목을 5개 추천해줘" },
  { label: "톤 개선", icon: Wand2, prompt: "이 콘텐츠를 더 전문적인 톤으로 개선해줘" },
] as const;

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">
        AI에게 콘텐츠에 대해 질문하세요
      </p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        Ctrl+Enter로 빠르게 실행
      </p>
    </div>
  );
}

function StreamingCursor() {
  return (
    <span className="inline-block w-1.5 h-4 bg-foreground/70 animate-pulse ml-0.5 align-text-bottom" />
  );
}
