import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Check, Eye, X, Loader2 } from "lucide-react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import type { AiSuggestion } from "../types";

interface Props {
  suggestion: AiSuggestion;
  onApply: (suggestionId: string) => void;
  onIgnore: (suggestionId: string) => void;
  onPreview: (suggestionId: string) => void;
  isApplying?: boolean;
  className?: string;
}

const TYPE_LABELS: Record<AiSuggestion["type"], string> = {
  add_screen: "화면 추가",
  remove_screen: "화면 삭제",
  update_screen: "화면 수정",
  add_edge: "전이 추가",
  update_edge: "전이 수정",
  update_detail: "상세 수정",
};

const TYPE_COLORS: Record<AiSuggestion["type"], string> = {
  add_screen: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  remove_screen: "bg-red-500/10 text-red-600 dark:text-red-400",
  update_screen: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  add_edge: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  update_edge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  update_detail: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

export function SuggestionCard({ suggestion, onApply, onIgnore, onPreview, isApplying, className }: Props) {
  const isResolved = suggestion.status !== "pending";

  return (
    <Card className={cn(
      "border-primary/20 bg-primary/5 transition-all",
      isResolved && "opacity-60",
      className,
    )}>
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className={cn("text-xs font-normal", TYPE_COLORS[suggestion.type])}>
            {TYPE_LABELS[suggestion.type]}
          </Badge>
          {suggestion.status === "applied" ? (
            <Badge variant="outline" className="text-xs text-emerald-600">적용됨</Badge>
          ) : null}
          {suggestion.status === "ignored" ? (
            <Badge variant="outline" className="text-xs text-muted-foreground">무시됨</Badge>
          ) : null}
        </div>
        <CardTitle className="text-sm font-medium mt-1">{suggestion.title}</CardTitle>
        <CardDescription className="text-xs">{suggestion.description}</CardDescription>
      </CardHeader>
      {!isResolved ? (
        <CardContent className="px-3 pb-3 pt-0">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onPreview(suggestion.id)}
            >
              <Eye className="mr-1 size-3" />
              미리보기
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => onApply(suggestion.id)}
              disabled={isApplying}
            >
              {isApplying ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <Check className="mr-1 size-3" />
              )}
              적용
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => onIgnore(suggestion.id)}
            >
              <X className="mr-1 size-3" />
              무시
            </Button>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
