/**
 * MetaPanel - 에디터 우측 메타 정보 패널
 *
 * 상단: 상태, 요약, 연결 주제 (항상 표시)
 * SEO 탭: 썸네일, SEO 점수, 메타 입력, 키워드 리서치, 내부 링크 추천
 * 에이전트 탭: AI 채팅
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@superbuilder/feature-ui/shadcn/tabs";
import { Megaphone } from "lucide-react";
import { SeoPanel } from "./seo-panel";
import { AgentPanel } from "./agent-panel";

interface Props {
  content: {
    title: string;
    summary: string | null;
    thumbnailUrl: string | null;
    status: string;
    topicLabel: string | null;
  };
  studioId: string;
  contentId: string;
  bodyText: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  slug: string | null;
  onUpdate: (data: Record<string, unknown>) => void;
  onSeoUpdate: (data: {
    seoTitle?: string;
    seoDescription?: string;
    seoKeywords?: string[];
    slug?: string;
  }) => void;
  onApplyContent: (content: string) => void;
  onNavigateMarketing: () => void;
}

export function MetaPanel({
  content,
  studioId,
  contentId,
  bodyText,
  seoTitle,
  seoDescription,
  seoKeywords,
  slug,
  onUpdate,
  onSeoUpdate,
  onApplyContent,
  onNavigateMarketing,
}: Props) {
  return (
    <aside className="w-80 shrink-0 border-l bg-background flex flex-col overflow-y-auto">
      {/* 상단: 메타 정보 (항상 표시) */}
      <div className="p-4 flex flex-col gap-4 shrink-0">
        {/* 상태 + 연결 주제 */}
        <div className="flex items-center gap-2">
          <Select
            value={content.status}
            onValueChange={(v) => onUpdate({ status: v })}
          >
            <SelectTrigger className="w-28">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {content.topicLabel && (
            <Badge variant="secondary" className="truncate">
              {content.topicLabel}
            </Badge>
          )}
        </div>

        {/* 요약 */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">요약</Label>
          <Textarea
            placeholder="콘텐츠 요약을 입력하세요"
            value={content.summary ?? ""}
            onChange={(e) => onUpdate({ summary: e.target.value })}
            rows={2}
            className="resize-none text-sm"
          />
        </div>
      </div>

      <Separator />

      {/* 탭: SEO / 에이전트 */}
      <Tabs defaultValue="seo" className="flex flex-col flex-1 min-h-0">
        <TabsList className="mx-4 mt-3 grid w-auto grid-cols-2">
          <TabsTrigger value="seo">분석</TabsTrigger>
          <TabsTrigger value="agent">에이전트</TabsTrigger>
        </TabsList>

        <TabsContent value="seo" className="flex-1 overflow-y-auto">
          <div className="p-4">
            <SeoPanel
              studioId={studioId}
              contentId={contentId}
              title={content.title}
              content={bodyText}
              seoTitle={seoTitle}
              seoDescription={seoDescription}
              seoKeywords={seoKeywords}
              slug={slug}
              thumbnailUrl={content.thumbnailUrl}
              onSeoUpdate={onSeoUpdate}
              onThumbnailChange={(url) => onUpdate({ thumbnailUrl: url })}
            />
          </div>
        </TabsContent>

        <TabsContent value="agent" className="flex-1 overflow-y-auto">
          <div className="p-4">
            <AgentPanel
              studioId={studioId}
              contentId={contentId}
              title={content.title}
              bodyText={bodyText}
              onApplyContent={onApplyContent}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* 하단: 마케팅 배포 (항상 표시) */}
      <div className="border-t p-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={onNavigateMarketing}
        >
          <Megaphone className="mr-2 size-4" />
          마케팅 배포
        </Button>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const STATUS_OPTIONS = [
  { value: "draft", label: "초안" },
  { value: "writing", label: "작성 중" },
  { value: "review", label: "검토" },
  { value: "published", label: "발행" },
  { value: "canceled", label: "취소" },
] as const;
