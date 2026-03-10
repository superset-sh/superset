/**
 * InternalLinkSuggestions - 내부 링크 추천 컴포넌트
 *
 * 같은 스튜디오 내 다른 콘텐츠를 조회하여 내부 링크 추천 목록을 표시한다.
 * 콘텐츠 ID를 클립보드에 복사하는 기능을 제공한다.
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Copy, Check, Link } from "lucide-react";
import { useInternalLinks } from "../../hooks";

interface Props {
  studioId: string;
  contentId: string;
}

export function InternalLinkSuggestions({ studioId, contentId }: Props) {
  const { data, isLoading } = useInternalLinks(studioId, contentId);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string) => {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-2">
        <Link className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">내부 링크 추천</span>
      </div>

      {/* Loading 상태 */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {/* 빈 상태 */}
      {!isLoading && (!data || data.length === 0) && (
        <p className="text-sm text-muted-foreground text-center py-4">
          추천할 내부 콘텐츠가 없습니다
        </p>
      )}

      {/* 콘텐츠 목록 (최대 5개) */}
      {!isLoading && data && data.length > 0 && (
        <div className="flex flex-col gap-1">
          {data.slice(0, MAX_ITEMS).map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md px-2 py-1.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">
                  {item.title}
                </span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {STATUS_LABEL_MAP[item.status] ?? item.status}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(item.id)}
              >
                {copiedId === item.id ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const MAX_ITEMS = 5;

/** 콘텐츠 상태 한국어 매핑 */
const STATUS_LABEL_MAP: Record<string, string> = {
  draft: "초안",
  writing: "작성 중",
  review: "검토",
  published: "발행",
  canceled: "취소",
};
