/**
 * SeoPanel - SEO 탭의 메인 컴포넌트
 *
 * SEO 점수 게이지, 썸네일, 메타 입력 필드, 체크리스트, 키워드 리서치,
 * 내부 링크 추천 등 SEO 관련 하위 컴포넌트들을 조합한다.
 */
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { ImagePlus, Loader2 } from "lucide-react";
import { uploadFile } from "@superbuilder/widgets/file-manager";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { SeoScoreGauge } from "./seo-score-gauge";
import { SeoChecklist } from "./seo-checklist";
import { KeywordResearch } from "./keyword-research";
import { InternalLinkSuggestions } from "./internal-link-suggestions";
import { useAnalysisScore } from "../../hooks";

interface Props {
  studioId: string;
  contentId: string;
  title: string;
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  slug: string | null;
  thumbnailUrl: string | null;
  onSeoUpdate: (data: {
    seoTitle?: string;
    seoDescription?: string;
    seoKeywords?: string[];
    slug?: string;
  }) => void;
  onThumbnailChange: (url: string | null) => void;
}

export function SeoPanel({
  studioId,
  contentId,
  title,
  content,
  seoTitle,
  seoDescription,
  seoKeywords,
  slug,
  thumbnailUrl,
  onSeoUpdate,
  onThumbnailChange,
}: Props) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      // Content Studio용 별도 폴더 지정
      const result = await uploadFile(file, { bucket: "public-files", folder: `content-studio/${studioId}` });
      onThumbnailChange(result.url);
      toast.success("썸네일이 업로드되었습니다.");
    } catch (error) {
      toast.error("썸네일 업로드에 실패했습니다.");
      console.error(error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // To remove the old function signature and body start
  
  const { totalScore, domainScores, byDomain, byCategory } = useAnalysisScore({
    title,
    content,
    contentHtml: "",
    seoTitle,
    seoDescription,
    seoKeywords,
    slug,
    imageCount: 0,
    imageAltCount: 0,
    internalLinkCount: 0,
    externalLinkCount: 0,
    h2Count: 0,
    h3Count: 0,
    thumbnailUrl,
  });

  const descriptionLength = seoDescription?.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* SEO 점수 게이지 */}
      <div className="flex justify-center">
        <SeoScoreGauge score={Math.round(totalScore)} maxScore={100} />
      </div>


      {/* 도메인별 점수 바 */}
      <DomainScoreBars domainScores={domainScores} />
      {/* 썸네일 */}
      <div className="flex flex-col gap-2">
        <Label>썸네일 URL</Label>
        <div className="flex gap-2">
          <Input
            placeholder="https://example.com/image.jpg"
            value={thumbnailUrl ?? ""}
            onChange={(e) => onThumbnailChange(e.target.value || null)}
            className="flex-1"
          />
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </Button>
        </div>
        {thumbnailUrl && (
          <div className="mt-1 rounded-md overflow-hidden border">
            <img
              src={thumbnailUrl}
              alt="썸네일 미리보기"
              className="w-full h-32 object-cover"
            />
          </div>
        )}
      </div>

      <Separator />

      {/* SEO 메타 입력 필드 */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>SEO 제목</Label>
          <Input
            placeholder="검색 결과에 표시될 제목"
            value={seoTitle ?? ""}
            onChange={(e) => onSeoUpdate({ seoTitle: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>메타 설명</Label>
          <Textarea
            placeholder="검색 결과에 표시될 설명"
            rows={3}
            value={seoDescription ?? ""}
            onChange={(e) => onSeoUpdate({ seoDescription: e.target.value })}
          />
          <span className="text-xs text-muted-foreground text-right">
            {descriptionLength}/160
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <Label>URL Slug</Label>
          <Input
            placeholder="url-slug"
            value={slug ?? ""}
            onChange={(e) => onSeoUpdate({ slug: e.target.value })}
          />
        </div>
      </div>

      <Separator />

      {/* SEO 체크리스트 */}
      <SeoChecklist byCategory={byCategory} byDomain={byDomain} />

      <Separator />

      {/* 키워드 리서치 */}
      <KeywordResearch
        studioId={studioId}
        contentId={contentId}
        title={title}
        bodyText={content}
        seoKeywords={seoKeywords}
        onKeywordsChange={(keywords) => onSeoUpdate({ seoKeywords: keywords })}
      />

      <Separator />

      {/* 내부 링크 추천 */}
      <InternalLinkSuggestions studioId={studioId} contentId={contentId} />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * DomainScoreBars — 도메인별 미니 프로그레스 바
 * -----------------------------------------------------------------------------------------------*/

const DOMAIN_BAR_CONFIG: Record<string, { label: string; barClass: string }> = {
  seo: { label: "SEO", barClass: "bg-blue-500" },
  aeo: { label: "AEO", barClass: "bg-violet-500" },
  geo: { label: "GEO", barClass: "bg-emerald-500" },
};

interface DomainScoreBarsProps {
  domainScores: {
    seo: { score: number; maxScore: number; percentage: number };
    aeo: { score: number; maxScore: number; percentage: number };
    geo: { score: number; maxScore: number; percentage: number };
  };
}

function DomainScoreBars({ domainScores }: DomainScoreBarsProps) {
  const domains = (["seo", "aeo", "geo"] as const).filter(
    (d) => domainScores[d].maxScore > 0,
  );

  if (domains.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-2">
      {domains.map((domain) => {
        const { percentage } = domainScores[domain];
        const config = DOMAIN_BAR_CONFIG[domain];
        if (!config) return null;
        return (
          <div key={domain} className="flex items-center gap-2 text-xs">
            <span className="w-8 shrink-0 font-medium">{config.label}</span>
            <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full transition-all ${config.barClass}`}
                style={{ width: `${Math.round(percentage)}%` }}
              />
            </div>
            <span className="text-muted-foreground w-8 shrink-0 text-right">
              {Math.round(percentage)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
