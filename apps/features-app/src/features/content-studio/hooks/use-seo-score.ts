import { useMemo } from "react";
import { SEO_RULES, buildSeoContext } from "../lib/seo-rules";
import type { SeoRule, SeoCheckResult } from "../lib/seo-rules";

interface SeoScoreInput {
  title: string;
  content: string;
  contentHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  slug: string | null;
  imageCount: number;
  imageAltCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  h2Count: number;
  h3Count: number;
}

interface SeoScoreResult {
  totalScore: number;
  maxScore: number;
  results: Array<{ rule: SeoRule; result: SeoCheckResult }>;
  byCategory: Record<string, Array<{ rule: SeoRule; result: SeoCheckResult }>>;
}

export function useSeoScore(input: SeoScoreInput): SeoScoreResult {
  return useMemo(() => {
    const ctx = buildSeoContext(input);

    const results = SEO_RULES.map((rule) => ({
      rule,
      result: rule.check(ctx),
    }));

    const totalScore = results.reduce((sum, r) => sum + r.result.score, 0);
    const maxScore = SEO_RULES.reduce((sum, r) => sum + r.maxScore, 0);

    const byCategory: Record<
      string,
      Array<{ rule: SeoRule; result: SeoCheckResult }>
    > = {};
    for (const r of results) {
      const cat = r.rule.category;
      if (!byCategory[cat]) {
        byCategory[cat] = [];
      }
      byCategory[cat]!.push(r);
    }

    return { totalScore, maxScore, results, byCategory };
  }, [
    input.title,
    input.content,
    input.contentHtml,
    input.seoTitle,
    input.seoDescription,
    input.seoKeywords,
    input.slug,
    input.imageCount,
    input.imageAltCount,
    input.internalLinkCount,
    input.externalLinkCount,
    input.h2Count,
    input.h3Count,
  ]);
}
