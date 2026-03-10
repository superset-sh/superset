/**
 * KeywordResearch - 키워드 리서치 UI 컴포넌트
 *
 * 현재 키워드 관리, AI 키워드 추천, 키워드 밀도 분석을 제공한다.
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Sparkles, Loader2, X } from "lucide-react";
import { useKeywordResearch } from "../../hooks";

interface Props {
  studioId: string;
  contentId: string;
  title: string;
  bodyText: string;
  seoKeywords: string[];
  onKeywordsChange: (keywords: string[]) => void;
}

export function KeywordResearch({
  studioId,
  contentId,
  title,
  bodyText,
  seoKeywords,
  onKeywordsChange,
}: Props) {
  const [newKeyword, setNewKeyword] = useState("");
  const mutation = useKeywordResearch();

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim();
    if (!trimmed || seoKeywords.includes(trimmed)) return;
    onKeywordsChange([...seoKeywords, trimmed]);
    setNewKeyword("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const handleRemoveKeyword = (index: number) => {
    onKeywordsChange(seoKeywords.filter((_, i) => i !== index));
  };

  const handleSuggest = () => {
    mutation.mutate({
      studioId,
      contentId,
      title,
      bodyText,
      currentKeywords: seoKeywords,
    });
  };

  const handleAddSuggested = (keyword: string) => {
    if (seoKeywords.includes(keyword)) return;
    onKeywordsChange([...seoKeywords, keyword]);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 현재 키워드 영역 */}
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium">키워드</Label>
        <div className="flex flex-wrap gap-2">
          {seoKeywords.map((keyword, index) => (
            <KeywordTag
              key={keyword}
              keyword={keyword}
              density={calcDensity(keyword, bodyText)}
              onRemove={() => handleRemoveKeyword(index)}
            />
          ))}
        </div>
        <Input
          placeholder="키워드 입력 후 Enter"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* AI 키워드 추천 버튼 */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleSuggest}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 size-4" />
        )}
        AI 키워드 추천
      </Button>

      {/* 추천 결과 표시 */}
      {mutation.data && (
        <SuggestionResults
          data={mutation.data}
          seoKeywords={seoKeywords}
          onAdd={handleAddSuggested}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

/** 키워드 태그 + 밀도 표시 + 삭제 버튼 */
function KeywordTag({
  keyword,
  density,
  onRemove,
}: {
  keyword: string;
  density: number;
  onRemove: () => void;
}) {
  return (
    <Badge variant="secondary" className="flex items-center gap-1 pr-1">
      <span>{keyword}</span>
      <span className="text-xs text-muted-foreground">
        {density.toFixed(1)}%
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 rounded-md p-0.5 hover:bg-muted"
      >
        <X className="size-3" />
      </button>
    </Badge>
  );
}

/** AI 추천 결과 전체 */
function SuggestionResults({
  data,
  seoKeywords,
  onAdd,
}: {
  data: {
    mainKeywords: { keyword: string; reason: string }[];
    longTailKeywords: { keyword: string; reason: string }[];
    questionKeywords: string[];
    relatedQueries: string[];
  };
  seoKeywords: string[];
  onAdd: (keyword: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* 핵심 키워드 */}
      {data.mainKeywords.length > 0 && (
        <KeywordSection title="핵심 키워드">
          {data.mainKeywords.map((item) => (
            <KeywordWithReason
              key={item.keyword}
              keyword={item.keyword}
              reason={item.reason}
              disabled={seoKeywords.includes(item.keyword)}
              onAdd={() => onAdd(item.keyword)}
            />
          ))}
        </KeywordSection>
      )}

      {/* 롱테일 키워드 */}
      {data.longTailKeywords.length > 0 && (
        <KeywordSection title="롱테일 키워드">
          {data.longTailKeywords.map((item) => (
            <KeywordWithReason
              key={item.keyword}
              keyword={item.keyword}
              reason={item.reason}
              disabled={seoKeywords.includes(item.keyword)}
              onAdd={() => onAdd(item.keyword)}
            />
          ))}
        </KeywordSection>
      )}

      {/* 질문형 키워드 */}
      {data.questionKeywords.length > 0 && (
        <KeywordSection title="질문형 키워드">
          <div className="flex flex-wrap gap-2">
            {data.questionKeywords.map((q) => (
              <Badge
                key={q}
                variant="outline"
                className={
                  seoKeywords.includes(q)
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer hover:bg-muted"
                }
                onClick={() => !seoKeywords.includes(q) && onAdd(q)}
              >
                {q}
              </Badge>
            ))}
          </div>
        </KeywordSection>
      )}

      {/* 관련 검색어 */}
      {data.relatedQueries.length > 0 && (
        <KeywordSection title="관련 검색어">
          <ul className="flex flex-col gap-1">
            {data.relatedQueries.map((query) => (
              <li
                key={query}
                className="text-sm text-muted-foreground"
              >
                {query}
              </li>
            ))}
          </ul>
        </KeywordSection>
      )}
    </div>
  );
}

/** 섹션 래퍼 */
function KeywordSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{title}</span>
      {children}
    </div>
  );
}

/** keyword + reason 을 가진 클릭 가능 키워드 */
function KeywordWithReason({
  keyword,
  reason,
  disabled,
  onAdd,
}: {
  keyword: string;
  reason: string;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Badge
        variant="outline"
        className={
          disabled
            ? "w-fit opacity-50 cursor-not-allowed"
            : "w-fit cursor-pointer hover:bg-muted"
        }
        onClick={() => !disabled && onAdd()}
      >
        {keyword}
      </Badge>
      <span className="text-xs text-muted-foreground">{reason}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

/** bodyText 내 키워드 출현 밀도(%) 계산 */
function calcDensity(keyword: string, bodyText: string): number {
  if (!bodyText || !keyword) return 0;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = bodyText.match(new RegExp(escaped, "gi"));
  const occurrences = matches ? matches.length : 0;
  // 단어 수 기준 밀도
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return 0;
  return (occurrences / wordCount) * 100;
}
