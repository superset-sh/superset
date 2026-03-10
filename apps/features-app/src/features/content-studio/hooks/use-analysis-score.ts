import { useMemo } from "react";
import { ANALYSIS_RULES, buildAnalysisContext, calculateScores } from "../lib/analysis-rules";
import type { AnalysisDomain, AnalysisResult, AnalysisRule } from "../lib/analysis-rules";

export interface AnalysisScoreInput {
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
  thumbnailUrl?: string | null;
  authorName?: string | null;
  dateModified?: string | null;
  headingTexts?: string[];
  linkTexts?: string[];
  faqSections?: { question: string; answer: string }[];
  questionHeadings?: string[];
  listCount?: number;
  tableCount?: number;
  citationCount?: number;
  quotationCount?: number;
  statisticCount?: number;
  uniqueWordRatio?: number;
  datePublished?: string | null;
}

export interface AnalysisScoreResult {
  totalScore: number;
  domainScores: {
    seo: { score: number; maxScore: number; percentage: number };
    aeo: { score: number; maxScore: number; percentage: number };
    geo: { score: number; maxScore: number; percentage: number };
  };
  results: Array<{ rule: AnalysisRule; result: AnalysisResult }>;
  byDomain: Record<AnalysisDomain, Array<{ rule: AnalysisRule; result: AnalysisResult }>>;
  byCategory: Record<string, Array<{ rule: AnalysisRule; result: AnalysisResult }>>;
}

export function useAnalysisScore(input: AnalysisScoreInput): AnalysisScoreResult {
  return useMemo(() => {
    const ctx = buildAnalysisContext({
      title: input.title,
      content: input.content,
      contentHtml: input.contentHtml,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      seoKeywords: input.seoKeywords,
      slug: input.slug,
      imageCount: input.imageCount,
      imageAltCount: input.imageAltCount,
      internalLinkCount: input.internalLinkCount,
      externalLinkCount: input.externalLinkCount,
      h2Count: input.h2Count,
      h3Count: input.h3Count,
      thumbnailUrl: input.thumbnailUrl,
      authorName: input.authorName,
      dateModified: input.dateModified,
      headingTexts: input.headingTexts,
      linkTexts: input.linkTexts,
      faqSections: input.faqSections,
      questionHeadings: input.questionHeadings,
      listCount: input.listCount,
      tableCount: input.tableCount,
      citationCount: input.citationCount,
      quotationCount: input.quotationCount,
      statisticCount: input.statisticCount,
      uniqueWordRatio: input.uniqueWordRatio,
      datePublished: input.datePublished,
    });

    const { totalScore, domainScores, results } = calculateScores(ANALYSIS_RULES, ctx);

    const byDomain: Record<
      AnalysisDomain,
      Array<{ rule: AnalysisRule; result: AnalysisResult }>
    > = {
      seo: [],
      aeo: [],
      geo: [],
    };
    for (const r of results) {
      byDomain[r.rule.domain].push(r);
    }

    const byCategory: Record<string, Array<{ rule: AnalysisRule; result: AnalysisResult }>> = {};
    for (const r of results) {
      const cat = r.rule.category;
      if (!byCategory[cat]) {
        byCategory[cat] = [];
      }
      byCategory[cat]!.push(r);
    }

    return { totalScore, domainScores, results, byDomain, byCategory };
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
    input.thumbnailUrl,
    input.authorName,
    input.dateModified,
    input.headingTexts,
    input.linkTexts,
    input.faqSections,
    input.questionHeadings,
    input.listCount,
    input.tableCount,
    input.citationCount,
    input.quotationCount,
    input.statisticCount,
    input.uniqueWordRatio,
    input.datePublished,
  ]);
}
