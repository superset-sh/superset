/**
 * SeoChecklist - SEO/AEO/GEO 규칙 체크리스트
 *
 * 도메인별 → 카테고리별 접이식 패널로 분석 규칙 결과를 표시한다.
 * 각 규칙의 pass/partial/fail 상태와 점수를 시각적으로 보여준다.
 */
import { useState } from "react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@superbuilder/feature-ui/shadcn/collapsible";
import { AlertCircle, CheckCircle2, ChevronRight, XCircle } from "lucide-react";
import type { AnalysisDomain, AnalysisResult, AnalysisRule } from "../../lib/analysis-rules";

type RuleItem = { rule: AnalysisRule; result: AnalysisResult };

interface Props {
  byCategory: Record<string, Array<RuleItem>>;
  byDomain: Record<AnalysisDomain, Array<RuleItem>>;
}

export function SeoChecklist({ byDomain }: Props) {
  const domains = ["seo", "aeo", "geo"] as const;

  return (
    <div className="flex flex-col gap-2">
      {domains.map((domain) => {
        const items = byDomain[domain] ?? [];
        if (items.length === 0) return null;

        return <DomainSection key={domain} domain={domain} items={items} />;
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const DOMAIN_LABELS: Record<string, string> = {
  seo: "SEO",
  aeo: "AEO",
  geo: "GEO",
};

const CATEGORY_LABELS: Record<string, string> = {
  content: "콘텐츠",
  meta: "메타",
  structure: "구조",
  link: "링크",
  answer: "답변",
  format: "형식",
  authority: "권위",
  quality: "품질",
  freshness: "신선도",
};

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface DomainSectionProps {
  domain: AnalysisDomain;
  items: Array<RuleItem>;
}

function DomainSection({ domain, items }: DomainSectionProps) {
  const [open, setOpen] = useState(true);

  const earned = items.reduce((sum, item) => sum + item.result.score, 0);
  const max = items.reduce((sum, item) => sum + item.rule.maxScore, 0);
  const label = DOMAIN_LABELS[domain] ?? domain;

  // Group items by category
  const byCategory = new Map<string, Array<RuleItem>>();
  for (const item of items) {
    const cat = item.rule.category;
    if (!byCategory.has(cat)) {
      byCategory.set(cat, []);
    }
    byCategory.get(cat)!.push(item);
  }

  // Sort categories by CATEGORY_LABELS order
  const categoryOrder = Object.keys(CATEGORY_LABELS);
  const sortedCategories = [...byCategory.keys()].sort(
    (a, b) =>
      (categoryOrder.indexOf(a) === -1 ? 999 : categoryOrder.indexOf(a)) -
      (categoryOrder.indexOf(b) === -1 ? 999 : categoryOrder.indexOf(b)),
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold">
        <ChevronRight
          className={cn("size-4 shrink-0 transition-transform duration-200", open && "rotate-90")}
        />
        <span>{label}</span>
        <span className="text-muted-foreground ml-auto text-sm">
          {earned}/{max}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-1 pl-2">
          {sortedCategories.map((category) => {
            const categoryItems = byCategory.get(category) ?? [];
            return <CategorySection key={category} category={category} items={categoryItems} />;
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface CategorySectionProps {
  category: string;
  items: Array<RuleItem>;
}

function CategorySection({ category, items }: CategorySectionProps) {
  const [open, setOpen] = useState(true);

  const earned = items.reduce((sum, item) => sum + item.result.score, 0);
  const max = items.reduce((sum, item) => sum + item.rule.maxScore, 0);
  const label = CATEGORY_LABELS[category] ?? category;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium">
        <ChevronRight
          className={cn("size-4 shrink-0 transition-transform duration-200", open && "rotate-90")}
        />
        <span>{label}</span>
        <span className="text-muted-foreground ml-auto text-sm">
          {earned}/{max}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-1 py-1 pl-4">
          {items.map((item) => (
            <RuleItemRow key={item.rule.id} rule={item.rule} result={item.result} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface RuleItemRowProps {
  rule: AnalysisRule;
  result: AnalysisResult;
}

function RuleItemRow({ rule, result }: RuleItemRowProps) {
  const StatusIcon = STATUS_ICON_MAP[result.status];
  const statusColorClass = STATUS_COLOR_MAP[result.status];

  return (
    <div className="flex flex-col gap-0.5 rounded-md px-2 py-1.5">
      <div className="flex items-center gap-2">
        <StatusIcon className={cn("size-4 shrink-0", statusColorClass)} />
        <span className="text-sm">{rule.label}</span>
        <span className="text-muted-foreground ml-auto text-sm">
          {result.score}/{rule.maxScore}
        </span>
      </div>
      <p className="text-muted-foreground pl-6 text-xs">{result.message}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

/** 상태별 아이콘 매핑 */
const STATUS_ICON_MAP = {
  pass: CheckCircle2,
  partial: AlertCircle,
  fail: XCircle,
} as const;

/** 상태별 색상 클래스 매핑 */
const STATUS_COLOR_MAP: Record<string, string> = {
  pass: "text-green-600",
  partial: "text-yellow-600",
  fail: "text-destructive",
};
