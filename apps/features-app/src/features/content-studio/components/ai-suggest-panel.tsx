import { useState, useEffect, useRef } from "react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { X, Sparkles, Send, FileText, Check, Loader2 } from "lucide-react";
import { aiPanelOpenAtom, aiPanelTopicAtom } from "../store/canvas-store";
import { useAiSuggest, useAiGenerate, useCanvasData } from "../hooks";
import { AiRecurrenceManager } from "./ai-recurrence-manager";

interface Props {
  studioId: string;
}

export function AiSuggestPanel({ studioId }: Props) {
  const [open, setOpen] = useAtom(aiPanelOpenAtom);
  const topic = useAtomValue(aiPanelTopicAtom);
  const setAiPanelTopic = useSetAtom(aiPanelTopicAtom);
  const { suggest } = useAiSuggest(studioId);
  const { generate } = useAiGenerate(studioId);
  const { data: canvasData } = useCanvasData(studioId);
  const topics = (canvasData?.topics ?? []).map((t) => ({ id: t.id, label: t.label }));

  const [prompt, setPrompt] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [generatedIds, setGeneratedIds] = useState<Set<number>>(new Set());
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);

  // 토픽 전환 시 이전 추천 데이터 초기화
  const prevTopicId = useRef(topic?.id);
  useEffect(() => {
    if (topic?.id !== prevTopicId.current) {
      setSuggestions([]);
      setGeneratedIds(new Set());
      setGeneratingIndex(null);
      setPrompt("");
      prevTopicId.current = topic?.id;
    }
  }, [topic?.id]);

  if (!open || !topic) return null;

  const handleSuggest = () => {
    suggest.mutate(
      { studioId, topicId: topic.id, prompt: prompt.trim() || undefined },
      {
        onSuccess: (data) => {
          setSuggestions(data as Suggestion[]);
          setGeneratedIds(new Set());
          setGeneratingIndex(null);
        },
      },
    );
  };

  const handleGenerate = (suggestion: Suggestion, index: number) => {
    setGeneratingIndex(index);
    generate.mutate(
      {
        studioId,
        topicId: topic.id,
        suggestion: {
          title: suggestion.title,
          description: suggestion.description,
          nodeType: suggestion.nodeType,
          relevance: suggestion.relevance,
        },
      },
      {
        onSuccess: () => {
          setGeneratedIds((prev) => new Set(prev).add(index));
          setGeneratingIndex(null);
        },
        onError: () => {
          setGeneratingIndex(null);
        },
      },
    );
  };

  const handleClose = () => {
    setOpen(false);
    setAiPanelTopic(null);
    setSuggestions([]);
    setGeneratedIds(new Set());
    setGeneratingIndex(null);
    setPrompt("");
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 z-20 flex w-[340px] flex-col border-l bg-background shadow-md">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="size-4 text-primary shrink-0" />
          <span className="text-sm font-semibold truncate">{topic.label}</span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* 프롬프트 입력 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="방향 제시 (선택)"
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSuggest();
          }}
        />
        <Button
          size="sm"
          className="h-8 px-3 shrink-0"
          onClick={handleSuggest}
          disabled={suggest.isPending}
        >
          {suggest.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
        </Button>
      </div>

      {/* 콘텐츠 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {suggest.isPending ? (
          <SuggestSkeleton />
        ) : suggest.isError ? (
          <ErrorState onRetry={handleSuggest} />
        ) : suggestions.length === 0 ? (
          <EmptyState onSuggest={handleSuggest} />
        ) : (
          <div className="flex flex-col gap-3">
            {suggestions.map((s, i) => (
              <SuggestionCard
                key={i}
                suggestion={s}
                isGenerated={generatedIds.has(i)}
                isGenerating={generatingIndex === i}
                onGenerate={() => handleGenerate(s, i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 자동 반복 관리 */}
      <AiRecurrenceManager studioId={studioId} topics={topics} />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function SuggestionCard({
  suggestion,
  isGenerated,
  isGenerating,
  onGenerate,
}: {
  suggestion: Suggestion;
  isGenerated: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{suggestion.title}</p>
        <span className="text-xs bg-muted/50 rounded px-1.5 py-0.5 shrink-0">
          {suggestion.nodeType}
        </span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
        {suggestion.description}
      </p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground/70">{suggestion.relevance}</span>
        {isGenerated ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="size-3" />
            생성 완료
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={onGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <FileText className="size-3" />
            )}
            초안 생성
          </Button>
        )}
      </div>
    </div>
  );
}

function SuggestSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-border/50 p-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-7 w-20 ml-auto" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onSuggest }: { onSuggest: () => void }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <Sparkles className="size-10 text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground">
        이 주제에 대한 AI 추천을 생성해보세요
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onSuggest}>
        추천 생성
      </Button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <p className="text-sm text-destructive mb-2">추천 생성에 실패했습니다</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface Suggestion {
  title: string;
  description: string;
  nodeType: string;
  relevance: string;
}
