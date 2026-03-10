/**
 * PlatformPreview - 플랫폼별 콘텐츠 미리보기 (글자 수 검증 포함)
 */
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface Props {
  platform: string;
  title: string;
  body: string;
  className?: string;
}

export function PlatformPreview({ platform, title, body, className }: Props) {
  const constraints = PLATFORM_CONSTRAINTS[platform];
  const charCount = body.length;
  const isOverLimit = constraints ? charCount > constraints.maxCharacters : false;

  return (
    <div className={cn("rounded-lg border p-4 space-y-3", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{constraints?.label ?? platform}</span>
        <Badge variant={isOverLimit ? "destructive" : "secondary"} className="text-xs">
          {charCount} / {constraints?.maxCharacters ?? "?"}
        </Badge>
      </div>

      {title && <p className="text-sm font-medium line-clamp-2">{title}</p>}

      <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6">
        {body || "본문을 입력하세요"}
      </p>

      {isOverLimit && (
        <p className="text-xs text-destructive">
          글자 수 제한을 초과했습니다. {charCount - (constraints?.maxCharacters ?? 0)}자 줄여주세요.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const PLATFORM_CONSTRAINTS: Record<string, { label: string; maxCharacters: number }> = {
  facebook: { label: "Facebook", maxCharacters: 63206 },
  instagram: { label: "Instagram", maxCharacters: 2200 },
  threads: { label: "Threads", maxCharacters: 500 },
  x: { label: "X (Twitter)", maxCharacters: 280 },
  linkedin: { label: "LinkedIn", maxCharacters: 3000 },
};
