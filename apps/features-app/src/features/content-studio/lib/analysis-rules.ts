/**
 * 통합 분석 규칙 시스템
 *
 * SEO/AEO/GEO 도메인을 단일 엔진으로 분석하기 위한 코어 타입과 점수 계산 유틸리티.
 */

// ============================================================================
// Types
// ============================================================================

/** 분석 도메인 */
export type AnalysisDomain = "seo" | "aeo" | "geo";

/** 규칙 실행 위치 */
export type RuleExecutionType = "client" | "server";

/** 단일 분석 규칙 정의 */
export interface AnalysisRule {
  id: string;
  domain: AnalysisDomain;
  category: string;
  label: string;
  description: string;
  maxScore: number;
  executionType: RuleExecutionType;
  check: (ctx: AnalysisContext) => AnalysisResult;
}

/** 통합 분석 컨텍스트 */
export interface AnalysisContext {
  // 기본 콘텐츠 필드 (기존 SeoContext 확장)
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  bodyText: string;
  bodyHtml: string;
  slug: string | null;
  imageCount: number;
  imageAltCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  h2Count: number;
  h3Count: number;
  wordCount: number;
  paragraphs: string[];
  firstParagraph: string;
  // AEO 확장 (Phase 2에서 활용)
  faqSections: { question: string; answer: string }[];
  questionHeadings: string[];
  listCount: number;
  tableCount: number;
  // GEO 확장 (Phase 2에서 활용)
  citationCount: number;
  quotationCount: number;
  statisticCount: number;
  uniqueWordRatio: number;
  authorName: string | null;
  datePublished: string | null;
  dateModified: string | null;
  // Phase 1 신규 SEO 규칙용 추가 필드
  thumbnailUrl: string | null;
  headingTexts: string[];
  linkTexts: string[];
}

/** 단일 규칙 실행 결과 */
export interface AnalysisResult {
  status: "pass" | "partial" | "fail";
  score: number;
  message: string;
  suggestions?: string[];
  autoFixable?: boolean;
}

/** buildAnalysisContext 입력 파라미터 */
export interface BuildAnalysisContextParams {
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
  faqSections?: { question: string; answer: string }[];
  questionHeadings?: string[];
  listCount?: number;
  tableCount?: number;
  citationCount?: number;
  quotationCount?: number;
  statisticCount?: number;
  uniqueWordRatio?: number;
  authorName?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
  thumbnailUrl?: string | null;
  headingTexts?: string[];
  linkTexts?: string[];
}

/** 도메인별 점수 집계 */
export interface DomainScore {
  score: number;
  maxScore: number;
  percentage: number;
}

/** 계산된 최종 점수 결과 */
export interface CalculatedScores {
  totalScore: number;
  domainScores: Record<AnalysisDomain, DomainScore>;
  results: Array<{ rule: AnalysisRule; result: AnalysisResult }>;
}

// ============================================================================
// Constants
// ============================================================================

/** 도메인 가중치 */
export const DOMAIN_WEIGHTS: Record<AnalysisDomain, number> = {
  seo: 0.4,
  aeo: 0.3,
  geo: 0.3,
};

// ============================================================================
// buildAnalysisContext 헬퍼
// ============================================================================

/**
 * 통합 분석 컨텍스트를 생성한다.
 *
 * 기존 buildSeoContext 패턴을 확장하며, AEO/GEO/신규 SEO 필드는 기본값을 제공한다.
 */
export function buildAnalysisContext(params: BuildAnalysisContextParams): AnalysisContext {
  const bodyText = params.content;
  const wordCount = bodyText.length; // 한국어는 글자수 기준
  const paragraphs = bodyText.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const firstParagraph = bodyText.slice(0, 100);

  return {
    title: params.title,
    seoTitle: params.seoTitle,
    seoDescription: params.seoDescription,
    seoKeywords: params.seoKeywords,
    bodyText,
    bodyHtml: params.contentHtml,
    slug: params.slug,
    imageCount: params.imageCount,
    imageAltCount: params.imageAltCount,
    internalLinkCount: params.internalLinkCount,
    externalLinkCount: params.externalLinkCount,
    h2Count: params.h2Count,
    h3Count: params.h3Count,
    wordCount,
    paragraphs,
    firstParagraph,
    faqSections: params.faqSections ?? detectFaqSections(bodyText),
    questionHeadings: params.questionHeadings ?? detectQuestionHeadings(bodyText),
    listCount: params.listCount ?? countLists(bodyText),
    tableCount: params.tableCount ?? countTables(bodyText),
    citationCount: params.citationCount ?? countCitations(bodyText),
    quotationCount: params.quotationCount ?? countQuotations(bodyText),
    statisticCount: params.statisticCount ?? countStatistics(bodyText),
    uniqueWordRatio: params.uniqueWordRatio ?? calculateUniqueWordRatio(bodyText),
    authorName: params.authorName ?? null,
    datePublished: params.datePublished ?? null,
    dateModified: params.dateModified ?? null,
    thumbnailUrl: params.thumbnailUrl ?? null,
    headingTexts: params.headingTexts ?? [],
    linkTexts: params.linkTexts ?? [],
  };
}

// ============================================================================
// 점수 헬퍼
// ============================================================================

/** partial 점수 = maxScore의 절반 반올림 */
export function partialScore(maxScore: number): number {
  return Math.round(maxScore / 2);
}

// ============================================================================
// 텍스트 자동 감지 헬퍼 (Phase 2)
// ============================================================================

function detectQuestionHeadings(text: string): string[] {
  if (!text.trim()) {
    return [];
  }

  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.endsWith("?"));
}

function detectFaqSections(text: string): { question: string; answer: string }[] {
  if (!text.trim()) {
    return [];
  }

  const lines = text.split(/\n+/).map((line) => line.trim());
  const sections: { question: string; answer: string }[] = [];
  const questionPattern = /^(Q\s*[:.)]|질문\s*[:.)])\s*/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      continue;
    }

    const isQuestion = questionPattern.test(line) || line.endsWith("?");
    if (!isQuestion) {
      continue;
    }

    const question = line.replace(questionPattern, "").trim();
    const answerLines: string[] = [];

    let j = i + 1;
    while (j < lines.length) {
      const nextLine = lines[j];
      if (!nextLine) {
        j++;
        if (answerLines.length > 0) {
          break;
        }
        continue;
      }

      const nextIsQuestion = questionPattern.test(nextLine) || nextLine.endsWith("?");
      if (nextIsQuestion) {
        break;
      }

      answerLines.push(nextLine.replace(/^(A\s*[:.)]|답변\s*[:.)])\s*/i, "").trim());
      j++;
    }

    const answer = answerLines.join(" ").trim();
    sections.push({ question, answer });
    i = Math.max(i, j - 1);
  }

  return sections.filter((section) => section.question.length > 0 || section.answer.length > 0);
}

function countLists(text: string): number {
  if (!text.trim()) {
    return 0;
  }

  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^([-*]\s+|\d+\.\s+)/.test(line)).length;
}

function countTables(text: string): number {
  if (!text.trim()) {
    return 0;
  }

  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.includes("|") && (line.match(/\|/g) ?? []).length >= 2).length;
}

function countCitations(text: string): number {
  if (!text.trim()) {
    return 0;
  }

  const patterns = [/\[출처\]/g, /에 따르면/g, /\(출처\s*:/g, /https?:\/\/[^\s)]+/g];
  return patterns.reduce((sum, pattern) => sum + (text.match(pattern) ?? []).length, 0);
}

function countQuotations(text: string): number {
  if (!text.trim()) {
    return 0;
  }

  return (text.match(/"[^"\n]{2,}"/g) ?? []).length;
}

function countStatistics(text: string): number {
  if (!text.trim()) {
    return 0;
  }

  return (text.match(/\d+(?:[,.]\d+)?\s*(?:%|원|달러|명|건|배)/g) ?? []).length;
}

function calculateUniqueWordRatio(text: string): number {
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return 0;
  }

  const uniqueWords = new Set(words);
  return uniqueWords.size / words.length;
}

// ============================================================================
// 규칙 정의
// ============================================================================

// --- Content 카테고리 ---

/** #1 제목 길이 (8점) */
function checkTitleLength(ctx: AnalysisContext): AnalysisResult {
  const len = ctx.title.length;
  const max = 8;

  if (len >= 30 && len <= 60) {
    return { status: "pass", score: max, message: `제목이 ${len}자로 적절합니다 (30~60자)` };
  }
  if ((len >= 20 && len < 30) || (len > 60 && len <= 80)) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `제목이 ${len}자입니다. 30~60자 사이가 권장됩니다`,
    };
  }
  return { status: "fail", score: 0, message: `제목이 ${len}자입니다. 30~60자 사이로 조정하세요` };
}

/** #2 본문 길이 (8점) */
function checkBodyLength(ctx: AnalysisContext): AnalysisResult {
  const len = ctx.wordCount;
  const max = 8;

  if (len >= 300) {
    return { status: "pass", score: max, message: `본문이 ${len}자로 충분합니다` };
  }
  if (len >= 150) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `본문이 ${len}자입니다. 300자 이상이 권장됩니다`,
    };
  }
  return { status: "fail", score: 0, message: `본문이 너무 짧습니다 (${len}자, 최소 300자)` };
}

/** #3 이미지 포함 (5점) */
function checkHasImages(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (ctx.imageCount >= 1) {
    return {
      status: "pass",
      score: max,
      message: `이미지 ${ctx.imageCount}개가 포함되어 있습니다`,
    };
  }
  return { status: "fail", score: 0, message: "이미지가 없습니다. 최소 1개 이상 추가하세요" };
}

/** #4 이미지 alt 텍스트 (5점) */
function checkImageAlt(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  // 이미지가 없으면 pass (검사 대상 없음)
  if (ctx.imageCount === 0) {
    return { status: "pass", score: max, message: "이미지가 없어 alt 검사를 건너뜁니다" };
  }

  if (ctx.imageAltCount === ctx.imageCount) {
    return {
      status: "pass",
      score: max,
      message: `모든 이미지(${ctx.imageCount}개)에 alt 텍스트가 있습니다`,
    };
  }

  const missing = ctx.imageCount - ctx.imageAltCount;
  if (ctx.imageAltCount > 0) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `이미지 ${ctx.imageCount}개 중 ${missing}개에 alt 텍스트가 없습니다`,
    };
  }
  return {
    status: "fail",
    score: 0,
    message: `이미지 ${ctx.imageCount}개 모두 alt 텍스트가 없습니다`,
  };
}

/** #5 가독성 (5점) - 문단별 평균 문장수 기준 */
function checkReadability(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (ctx.paragraphs.length === 0) {
    return { status: "fail", score: 0, message: "분석할 문단이 없습니다" };
  }

  // 각 문단의 문장 수 계산 (`.` `?` `!` 기준)
  const sentenceCounts = ctx.paragraphs.map((p) => {
    const sentences = p.split(/[.?!]+/).filter((s) => s.trim().length > 0);
    return sentences.length;
  });
  const avgSentences = sentenceCounts.reduce((sum, c) => sum + c, 0) / sentenceCounts.length;

  if (avgSentences >= 3 && avgSentences <= 5) {
    return {
      status: "pass",
      score: max,
      message: `문단당 평균 ${avgSentences.toFixed(1)}문장으로 가독성이 좋습니다`,
    };
  }
  if (avgSentences >= 2 && avgSentences <= 6) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `문단당 평균 ${avgSentences.toFixed(1)}문장입니다. 3~5문장이 권장됩니다`,
    };
  }
  return {
    status: "fail",
    score: 0,
    message: `문단당 평균 ${avgSentences.toFixed(1)}문장입니다. 3~5문장으로 조정하세요`,
  };
}

// --- Meta 카테고리 ---

/** #6 메타 설명 (8점) */
function checkMetaDescription(ctx: AnalysisContext): AnalysisResult {
  const max = 8;

  if (!ctx.seoDescription || ctx.seoDescription.trim().length === 0) {
    return { status: "fail", score: 0, message: "메타 설명이 없습니다. 100~160자로 작성하세요" };
  }

  const len = ctx.seoDescription.length;
  if (len >= 100 && len <= 160) {
    return { status: "pass", score: max, message: `메타 설명이 ${len}자로 적절합니다 (100~160자)` };
  }
  if ((len >= 50 && len < 100) || (len > 160 && len <= 200)) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `메타 설명이 ${len}자입니다. 100~160자 사이가 권장됩니다`,
    };
  }
  return {
    status: "fail",
    score: 0,
    message: `메타 설명이 ${len}자입니다. 100~160자 사이로 조정하세요`,
  };
}

/** #7 URL slug 존재 (5점) */
function checkHasSlug(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (ctx.slug && ctx.slug.trim().length > 0) {
    return { status: "pass", score: max, message: "URL slug이 설정되어 있습니다" };
  }
  return { status: "fail", score: 0, message: "URL slug이 없습니다. slug을 설정하세요" };
}

// --- Structure 카테고리 ---

/** #8 H2/H3 소제목 (7점) */
function checkHasHeadings(ctx: AnalysisContext): AnalysisResult {
  const max = 7;

  if (ctx.h2Count >= 1) {
    return {
      status: "pass",
      score: max,
      message: `H2 ${ctx.h2Count}개, H3 ${ctx.h3Count}개로 구조가 적절합니다`,
    };
  }
  if (ctx.h3Count >= 1) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `H3만 ${ctx.h3Count}개 있습니다. H2 소제목을 추가하세요`,
    };
  }
  return { status: "fail", score: 0, message: "소제목(H2/H3)이 없습니다. 구조를 추가하세요" };
}

/** #9 키워드-제목 포함 (7점) */
function checkKeywordTitle(ctx: AnalysisContext): AnalysisResult {
  const max = 7;

  if (ctx.seoKeywords.length === 0) {
    return { status: "fail", score: 0, message: "SEO 키워드가 설정되지 않았습니다" };
  }

  const titleLower = ctx.title.toLowerCase();
  const found = ctx.seoKeywords.some((kw) => titleLower.includes(kw.toLowerCase()));

  if (found) {
    return { status: "pass", score: max, message: "제목에 SEO 키워드가 포함되어 있습니다" };
  }
  return { status: "fail", score: 0, message: "제목에 SEO 키워드가 포함되지 않았습니다" };
}

/** #10 키워드-소제목 포함 (5점) - h2/h3 텍스트 접근 불가하므로 간접 판단 */
function checkKeywordSubheading(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (ctx.seoKeywords.length === 0) {
    return { status: "fail", score: 0, message: "SEO 키워드가 설정되지 않았습니다" };
  }

  // 현재 h2/h3 텍스트에 직접 접근 불가 → h2 존재 + 키워드 설정 시 partial
  if (ctx.h2Count > 0) {
    return {
      status: "partial",
      score: partialScore(max),
      message: "소제목이 있으나, 키워드 포함 여부는 직접 확인이 필요합니다",
    };
  }
  return { status: "fail", score: 0, message: "소제목이 없습니다. H2에 키워드를 포함하세요" };
}

/** #11 키워드-첫 문단 포함 (7점) */
function checkKeywordFirstPara(ctx: AnalysisContext): AnalysisResult {
  const max = 7;

  if (ctx.seoKeywords.length === 0) {
    return { status: "fail", score: 0, message: "SEO 키워드가 설정되지 않았습니다" };
  }

  const firstLower = ctx.firstParagraph.toLowerCase();
  const found = ctx.seoKeywords.some((kw) => firstLower.includes(kw.toLowerCase()));

  if (found) {
    return {
      status: "pass",
      score: max,
      message: "첫 문단(100자)에 SEO 키워드가 포함되어 있습니다",
    };
  }
  return {
    status: "fail",
    score: 0,
    message: "첫 문단(100자)에 SEO 키워드가 포함되지 않았습니다",
  };
}

/** #12 키워드 밀도 (7점) */
function checkKeywordDensity(ctx: AnalysisContext): AnalysisResult {
  const max = 7;

  if (ctx.seoKeywords.length === 0) {
    return { status: "fail", score: 0, message: "SEO 키워드가 설정되지 않았습니다" };
  }
  if (ctx.wordCount === 0) {
    return { status: "fail", score: 0, message: "본문이 비어 있습니다" };
  }

  // 각 키워드의 출현 비율을 합산 후 평균
  const bodyLower = ctx.bodyText.toLowerCase();
  const densities = ctx.seoKeywords.map((kw) => {
    const kwLower = kw.toLowerCase();
    let count = 0;
    let pos = 0;
    while (pos < bodyLower.length) {
      const idx = bodyLower.indexOf(kwLower, pos);
      if (idx === -1) break;
      count++;
      pos = idx + kwLower.length;
    }
    return (count * kwLower.length * 100) / ctx.wordCount;
  });
  const avgDensity = densities.reduce((sum, d) => sum + d, 0) / densities.length;

  if (avgDensity >= 1 && avgDensity <= 3) {
    return {
      status: "pass",
      score: max,
      message: `키워드 밀도 ${avgDensity.toFixed(1)}%로 적절합니다 (1~3%)`,
    };
  }
  if ((avgDensity >= 0.5 && avgDensity < 1) || (avgDensity > 3 && avgDensity <= 5)) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `키워드 밀도 ${avgDensity.toFixed(1)}%입니다. 1~3%가 권장됩니다`,
    };
  }
  return {
    status: "fail",
    score: 0,
    message: `키워드 밀도 ${avgDensity.toFixed(1)}%입니다. 1~3% 사이로 조정하세요`,
  };
}

/** #13 키워드-메타 설명 포함 (5점) */
function checkKeywordMeta(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (!ctx.seoDescription || ctx.seoDescription.trim().length === 0) {
    return { status: "fail", score: 0, message: "메타 설명이 없습니다" };
  }
  if (ctx.seoKeywords.length === 0) {
    return { status: "fail", score: 0, message: "SEO 키워드가 설정되지 않았습니다" };
  }

  const descLower = ctx.seoDescription.toLowerCase();
  const found = ctx.seoKeywords.some((kw) => descLower.includes(kw.toLowerCase()));

  if (found) {
    return { status: "pass", score: max, message: "메타 설명에 SEO 키워드가 포함되어 있습니다" };
  }
  return { status: "fail", score: 0, message: "메타 설명에 SEO 키워드가 포함되지 않았습니다" };
}

/** #14 키워드-slug 포함 (5점) */
function checkKeywordSlug(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (!ctx.slug || ctx.slug.trim().length === 0) {
    return { status: "fail", score: 0, message: "URL slug이 없습니다" };
  }
  if (ctx.seoKeywords.length === 0) {
    return { status: "fail", score: 0, message: "SEO 키워드가 설정되지 않았습니다" };
  }

  const slugLower = ctx.slug.toLowerCase();
  const found = ctx.seoKeywords.some((kw) => slugLower.includes(kw.toLowerCase()));

  if (found) {
    return { status: "pass", score: max, message: "URL slug에 SEO 키워드가 포함되어 있습니다" };
  }
  return { status: "fail", score: 0, message: "URL slug에 SEO 키워드가 포함되지 않았습니다" };
}

// --- Link 카테고리 ---

/** #15 내부 링크 (7점) */
function checkInternalLinks(ctx: AnalysisContext): AnalysisResult {
  const max = 7;

  if (ctx.internalLinkCount >= 1) {
    return {
      status: "pass",
      score: max,
      message: `내부 링크 ${ctx.internalLinkCount}개가 포함되어 있습니다`,
    };
  }
  return { status: "fail", score: 0, message: "내부 링크가 없습니다. 관련 콘텐츠를 연결하세요" };
}

/** #16 외부 링크 (6점) */
function checkExternalLinks(ctx: AnalysisContext): AnalysisResult {
  const max = 6;

  if (ctx.externalLinkCount >= 1) {
    return {
      status: "pass",
      score: max,
      message: `외부 링크 ${ctx.externalLinkCount}개가 포함되어 있습니다`,
    };
  }
  return { status: "fail", score: 0, message: "외부 링크가 없습니다. 참고 자료를 연결하세요" };
}

// --- 신규 SEO 규칙 (Phase 1) ---

/** #17 SEO 전용 제목 (5점) */
function checkSeoTitleSet(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (!ctx.seoTitle || ctx.seoTitle.trim().length === 0) {
    return { status: "fail", score: 0, message: "SEO 제목이 설정되지 않았습니다" };
  }
  if (ctx.seoTitle === ctx.title) {
    return {
      status: "partial",
      score: partialScore(max),
      message: "SEO 제목이 일반 제목과 동일합니다",
    };
  }
  return { status: "pass", score: max, message: "SEO 제목이 일반 제목과 다르게 설정되어 있습니다" };
}

/** #18 키워드 균형 (5점) */
function checkKeywordDensityBalance(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (ctx.seoKeywords.length === 0) {
    return { status: "fail", score: 0, message: "SEO 키워드가 설정되지 않았습니다" };
  }
  if (ctx.wordCount === 0) {
    return { status: "fail", score: 0, message: "본문이 비어 있습니다" };
  }

  const bodyLower = ctx.bodyText.toLowerCase();
  const densities = ctx.seoKeywords.map((kw) => {
    const kwLower = kw.toLowerCase();
    let count = 0;
    let pos = 0;
    while (pos < bodyLower.length) {
      const idx = bodyLower.indexOf(kwLower, pos);
      if (idx === -1) break;
      count++;
      pos = idx + kwLower.length;
    }
    return (count * kwLower.length * 100) / ctx.wordCount;
  });
  const avgDensity = densities.reduce((sum, d) => sum + d, 0) / densities.length;

  if (avgDensity > 5) {
    return { status: "fail", score: 0, message: `키워드 과다 사용 (${avgDensity.toFixed(1)}%)` };
  }
  if (avgDensity < 0.5) {
    return { status: "fail", score: 0, message: `키워드 부족 (${avgDensity.toFixed(1)}%)` };
  }
  return {
    status: "pass",
    score: max,
    message: `키워드 밀도 ${avgDensity.toFixed(1)}%로 균형이 적절합니다`,
  };
}

/** #19 단락 길이 (5점) */
function checkParagraphLength(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (ctx.paragraphs.length === 0) {
    return {
      status: "pass",
      score: max,
      message: "검사할 단락이 없어 단락 길이 검사를 통과합니다",
    };
  }

  const paragraphLengths = ctx.paragraphs.map((p) => p.length);
  const tooLongCount = paragraphLengths.filter((len) => len > 300).length;
  const hasVeryLongParagraph = paragraphLengths.some((len) => len >= 500);

  if (hasVeryLongParagraph) {
    return { status: "fail", score: 0, message: "500자 이상 단락이 있습니다. 단락을 나누세요" };
  }
  if (tooLongCount > 0) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `${tooLongCount}개 단락이 300자를 초과합니다. 단락을 조금 더 짧게 나누세요`,
    };
  }
  return { status: "pass", score: max, message: "모든 단락이 300자 이내입니다" };
}

/** #20 콘텐츠 신선도 (5점) */
function checkContentFreshness(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (!ctx.dateModified) {
    return { status: "fail", score: 0, message: "수정일 정보가 없습니다" };
  }

  const modifiedAt = new Date(ctx.dateModified);
  if (Number.isNaN(modifiedAt.getTime())) {
    return { status: "fail", score: 0, message: "수정일 형식이 올바르지 않습니다" };
  }

  const now = new Date();
  const dayMs = 1000 * 60 * 60 * 24;
  const ageDays = (now.getTime() - modifiedAt.getTime()) / dayMs;

  if (ageDays <= 90) {
    return {
      status: "pass",
      score: max,
      message: `최근 ${Math.floor(ageDays)}일 이내에 수정되었습니다`,
    };
  }
  if (ageDays <= 180) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `마지막 수정이 ${Math.floor(ageDays)}일 전입니다. 업데이트를 권장합니다`,
    };
  }
  return {
    status: "fail",
    score: 0,
    message: `마지막 수정이 ${Math.floor(ageDays)}일 전입니다. 콘텐츠 업데이트가 필요합니다`,
  };
}

/** #21 OG 이미지 (5점) */
function checkOgImage(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (ctx.thumbnailUrl && ctx.thumbnailUrl.trim().length > 0) {
    return { status: "pass", score: max, message: "OG 이미지가 설정되어 있습니다" };
  }
  return { status: "fail", score: 0, message: "OG 이미지가 없습니다. 썸네일을 설정하세요" };
}

/** #22 헤딩 계층 (5점) */
function checkHeadingHierarchy(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (ctx.headingTexts.length === 0) {
    return { status: "pass", score: max, message: "헤딩이 없어 계층 검사를 건너뜁니다" };
  }

  const hasH2 = ctx.headingTexts.some((heading) => heading.toLowerCase().startsWith("h2:"));
  const hasH3 = ctx.headingTexts.some((heading) => heading.toLowerCase().startsWith("h3:"));

  if (!hasH2 || !hasH3) {
    return {
      status: "pass",
      score: max,
      message: "단일 헤딩 레벨만 사용되어 계층 위반이 없습니다",
    };
  }

  let seenH2 = false;
  for (const heading of ctx.headingTexts) {
    const levelText = heading.split(":", 1)[0]?.trim().toLowerCase();
    if (levelText === "h2") {
      seenH2 = true;
      continue;
    }
    if (levelText === "h3" && !seenH2) {
      return { status: "fail", score: 0, message: "첫 H2 이전에 H3가 등장합니다" };
    }
  }

  return { status: "pass", score: max, message: "H2→H3 헤딩 계층이 올바릅니다" };
}

/** #23 링크 텍스트 품질 (5점) */
function checkLinkTextDescriptive(ctx: AnalysisContext): AnalysisResult {
  const max = 5;

  if (ctx.linkTexts.length === 0) {
    return { status: "pass", score: max, message: "링크 텍스트가 없어 품질 검사를 건너뜁니다" };
  }

  const nonDescriptivePattern =
    /^(여기|링크|클릭|here|click|link|더보기|자세히)(\s*보기)?[\s!.,]*$/i;

  const nonDescriptiveCount = ctx.linkTexts.filter((text) => {
    const normalized = text.trim();
    return normalized.length > 0 && nonDescriptivePattern.test(normalized);
  }).length;

  if (nonDescriptiveCount === 0) {
    return { status: "pass", score: max, message: "모든 링크 텍스트가 서술적입니다" };
  }
  if (nonDescriptiveCount === ctx.linkTexts.length) {
    return { status: "fail", score: 0, message: "모든 링크 텍스트가 비서술적입니다" };
  }
  return {
    status: "partial",
    score: partialScore(max),
    message: `${nonDescriptiveCount}개 링크 텍스트가 비서술적입니다`,
  };
}

/** #24 저자 정보 (10점) */
function checkEeatAuthor(ctx: AnalysisContext): AnalysisResult {
  const max = 10;

  if (ctx.authorName && ctx.authorName.trim().length > 0) {
    return { status: "pass", score: max, message: "저자 정보가 설정되어 있습니다" };
  }
  return { status: "fail", score: 0, message: "저자 정보가 없습니다. authorName을 설정하세요" };
}

// --- AEO 규칙 (Phase 2) ---

/** #25 FAQ 섹션 (10점) */
function checkAeoFaqPresence(ctx: AnalysisContext): AnalysisResult {
  const max = 10;

  if (ctx.faqSections.length >= 1) {
    return {
      status: "pass",
      score: max,
      message: `FAQ 섹션 ${ctx.faqSections.length}개가 감지되었습니다`,
    };
  }
  return { status: "fail", score: 0, message: "FAQ 섹션이 없습니다" };
}

/** #26 FAQ 답변 품질 (8점) */
function checkAeoFaqQuality(ctx: AnalysisContext): AnalysisResult {
  const max = 8;

  if (ctx.faqSections.length === 0) {
    return { status: "fail", score: 0, message: "FAQ 답변 품질을 평가할 섹션이 없습니다" };
  }

  const avgAnswerLength =
    ctx.faqSections.reduce((sum, section) => sum + section.answer.trim().length, 0) /
    ctx.faqSections.length;

  if (avgAnswerLength >= 50 && avgAnswerLength <= 200) {
    return {
      status: "pass",
      score: max,
      message: `FAQ 답변 평균 길이 ${avgAnswerLength.toFixed(0)}자로 적절합니다`,
    };
  }
  if (avgAnswerLength >= 30 && avgAnswerLength <= 300) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `FAQ 답변 평균 길이 ${avgAnswerLength.toFixed(0)}자입니다. 50~200자를 권장합니다`,
    };
  }
  return {
    status: "fail",
    score: 0,
    message: `FAQ 답변 평균 길이 ${avgAnswerLength.toFixed(0)}자입니다. 길이를 조정하세요`,
  };
}

/** #27 질문형 제목 (10점) */
function checkAeoQuestionHeadings(ctx: AnalysisContext): AnalysisResult {
  const max = 10;

  if (ctx.questionHeadings.length >= 2) {
    return {
      status: "pass",
      score: max,
      message: `질문형 제목 ${ctx.questionHeadings.length}개로 충분합니다`,
    };
  }
  if (ctx.questionHeadings.length === 1) {
    return {
      status: "partial",
      score: partialScore(max),
      message: "질문형 제목이 1개입니다. 최소 2개를 권장합니다",
    };
  }
  return { status: "fail", score: 0, message: "질문형 제목이 없습니다" };
}

/** #28 직접 답변 (10점) */
function checkAeoDirectAnswer(ctx: AnalysisContext): AnalysisResult {
  const max = 10;
  const intro = ctx.bodyText.trim().slice(0, 100);
  const hasCoreSentence = /[^.!?\n]{8,}\./.test(intro);

  if (hasCoreSentence) {
    return {
      status: "pass",
      score: max,
      message: "첫 100자 내에 핵심 답변 문장이 포함되어 있습니다",
    };
  }
  return {
    status: "fail",
    score: 0,
    message: "첫 100자 내에 마침표로 끝나는 핵심 답변 문장이 없습니다",
  };
}

/** #29 구조화 목록 (8점) */
function checkAeoStructuredLists(ctx: AnalysisContext): AnalysisResult {
  const max = 8;

  if (ctx.listCount >= 3) {
    return {
      status: "pass",
      score: max,
      message: `목록 항목 ${ctx.listCount}개로 구조가 충분합니다`,
    };
  }
  if (ctx.listCount >= 1) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `목록 항목 ${ctx.listCount}개입니다. 3개 이상을 권장합니다`,
    };
  }
  return { status: "fail", score: 0, message: "구조화된 목록이 없습니다" };
}

/** #30 데이터 테이블 (7점) */
function checkAeoDataTable(ctx: AnalysisContext): AnalysisResult {
  const max = 7;

  if (ctx.tableCount >= 1) {
    return {
      status: "pass",
      score: max,
      message: `테이블 행 ${ctx.tableCount}개가 감지되었습니다`,
    };
  }
  return { status: "fail", score: 0, message: "데이터 테이블이 없습니다" };
}

/** #31 정의 패턴 (8점) */
function checkAeoDefinitionPattern(ctx: AnalysisContext): AnalysisResult {
  const max = 8;
  const count = (ctx.bodyText.match(/[가-힣A-Za-z0-9]{2,}(?:는|이란|의미는)\s/g) ?? []).length;

  if (count >= 3) {
    return { status: "pass", score: max, message: `정의 패턴이 ${count}회 사용되었습니다` };
  }
  if (count >= 1) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `정의 패턴이 ${count}회입니다. 3회 이상을 권장합니다`,
    };
  }
  return { status: "fail", score: 0, message: "정의 패턴(예: ~는, ~이란)이 부족합니다" };
}

/** #32 단계별 설명 (8점) */
function checkAeoStepPattern(ctx: AnalysisContext): AnalysisResult {
  const max = 8;
  const count = (
    ctx.bodyText.match(/\d+단계|먼저|다음으로|이어서|마지막으로|첫째|둘째|셋째/g) ?? []
  ).length;

  if (count >= 2) {
    return { status: "pass", score: max, message: `단계 표현이 ${count}회 감지되었습니다` };
  }
  if (count === 1) {
    return {
      status: "partial",
      score: partialScore(max),
      message: "단계 표현이 1회입니다. 최소 2회 이상을 권장합니다",
    };
  }
  return { status: "fail", score: 0, message: "단계별 설명 패턴이 없습니다" };
}

/** #33 간결 문장 (7점) */
function checkAeoConciseSentences(ctx: AnalysisContext): AnalysisResult {
  const max = 7;
  const sentences = ctx.bodyText
    .split(/[.!?]+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  if (sentences.length === 0) {
    return { status: "fail", score: 0, message: "문장 분석 대상이 없습니다" };
  }

  const avgLength =
    sentences.reduce((sum, sentence) => sum + sentence.length, 0) / sentences.length;

  if (avgLength <= 40) {
    return {
      status: "pass",
      score: max,
      message: `문장 평균 길이 ${avgLength.toFixed(1)}자로 간결합니다`,
    };
  }
  if (avgLength <= 60) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `문장 평균 길이 ${avgLength.toFixed(1)}자입니다. 40자 이하를 권장합니다`,
    };
  }
  return {
    status: "fail",
    score: 0,
    message: `문장 평균 길이 ${avgLength.toFixed(1)}자로 길이가 긴 편입니다`,
  };
}

/** #34 How/What/Why 커버 (8점) */
function checkAeoHowWhatWhy(ctx: AnalysisContext): AnalysisResult {
  const max = 8;
  const kinds = ["어떻게", "무엇", "왜"].filter((keyword) => ctx.bodyText.includes(keyword));

  if (kinds.length >= 2) {
    return {
      status: "pass",
      score: max,
      message: `How/What/Why 중 ${kinds.length}종이 포함되어 있습니다`,
    };
  }
  if (kinds.length === 1) {
    return {
      status: "partial",
      score: partialScore(max),
      message: "How/What/Why 중 1종만 포함되어 있습니다",
    };
  }
  return { status: "fail", score: 0, message: "How/What/Why 키워드가 없습니다" };
}

/** #35 요약 섹션 (8점) */
function checkAeoSummaryPresent(ctx: AnalysisContext): AnalysisResult {
  const max = 8;
  const hasSummaryLine = ctx.bodyText
    .split(/\n+/)
    .some((line) => /(요약|정리|핵심)/.test(line.trim()));

  if (hasSummaryLine) {
    return { status: "pass", score: max, message: "요약/정리/핵심 섹션이 포함되어 있습니다" };
  }
  return { status: "fail", score: 0, message: "요약 섹션이 없습니다" };
}

/** #36 답변 깊이 (8점) */
function checkAeoAnswerDepth(ctx: AnalysisContext): AnalysisResult {
  const max = 8;

  if (ctx.faqSections.length === 0) {
    return { status: "fail", score: 0, message: "FAQ가 없어 답변 깊이를 평가할 수 없습니다" };
  }

  const avgAnswerLength =
    ctx.faqSections.reduce((sum, section) => sum + section.answer.trim().length, 0) /
    ctx.faqSections.length;

  if (avgAnswerLength >= 150) {
    return {
      status: "pass",
      score: max,
      message: `FAQ 답변 평균 길이 ${avgAnswerLength.toFixed(0)}자로 깊이가 충분합니다`,
    };
  }
  if (avgAnswerLength >= 80) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `FAQ 답변 평균 길이 ${avgAnswerLength.toFixed(0)}자입니다. 150자 이상을 권장합니다`,
    };
  }
  return {
    status: "fail",
    score: 0,
    message: `FAQ 답변 평균 길이 ${avgAnswerLength.toFixed(0)}자로 깊이가 부족합니다`,
  };
}

// --- GEO 규칙 (Phase 2) ---

/** #37 출처 인용 (10점) */
function checkGeoSourceCitation(ctx: AnalysisContext): AnalysisResult {
  const max = 10;

  if (ctx.citationCount >= 2) {
    return { status: "pass", score: max, message: `출처 인용 ${ctx.citationCount}회로 충분합니다` };
  }
  if (ctx.citationCount === 1) {
    return {
      status: "partial",
      score: partialScore(max),
      message: "출처 인용이 1회입니다. 2회 이상을 권장합니다",
    };
  }
  return { status: "fail", score: 0, message: "출처 인용이 없습니다" };
}

/** #38 전문가 인용 (8점) */
function checkGeoExpertQuote(ctx: AnalysisContext): AnalysisResult {
  const max = 8;

  if (ctx.quotationCount >= 1) {
    return {
      status: "pass",
      score: max,
      message: `인용문 ${ctx.quotationCount}개가 포함되어 있습니다`,
    };
  }
  return { status: "fail", score: 0, message: "전문가 인용문이 없습니다" };
}

/** #39 통계 데이터 (10점) */
function checkGeoStatistics(ctx: AnalysisContext): AnalysisResult {
  const max = 10;

  if (ctx.statisticCount >= 3) {
    return {
      status: "pass",
      score: max,
      message: `통계 데이터 ${ctx.statisticCount}개로 충분합니다`,
    };
  }
  if (ctx.statisticCount >= 1) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `통계 데이터 ${ctx.statisticCount}개입니다. 3개 이상을 권장합니다`,
    };
  }
  return { status: "fail", score: 0, message: "통계 데이터가 없습니다" };
}

/** #40 어휘 다양성 (8점) */
function checkGeoVocabularyDiversity(ctx: AnalysisContext): AnalysisResult {
  const max = 8;

  if (ctx.uniqueWordRatio >= 0.4) {
    return {
      status: "pass",
      score: max,
      message: `어휘 다양성 비율 ${ctx.uniqueWordRatio.toFixed(2)}로 우수합니다`,
    };
  }
  if (ctx.uniqueWordRatio >= 0.3) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `어휘 다양성 비율 ${ctx.uniqueWordRatio.toFixed(2)}입니다. 0.40 이상을 권장합니다`,
    };
  }
  return {
    status: "fail",
    score: 0,
    message: `어휘 다양성 비율 ${ctx.uniqueWordRatio.toFixed(2)}로 낮은 편입니다`,
  };
}

/** #41 발행일 표기 (7점) */
function checkGeoPublishDate(ctx: AnalysisContext): AnalysisResult {
  const max = 7;

  if (ctx.datePublished && ctx.datePublished.trim().length > 0) {
    return { status: "pass", score: max, message: "발행일이 설정되어 있습니다" };
  }
  return { status: "fail", score: 0, message: "발행일 정보가 없습니다" };
}

/** #42 사실 밀도 (8점) */
function checkGeoFactualDensity(ctx: AnalysisContext): AnalysisResult {
  const max = 8;

  if (ctx.wordCount === 0) {
    return {
      status: "fail",
      score: 0,
      message: "본문 길이가 0이라 사실 밀도를 계산할 수 없습니다",
    };
  }

  const factualCount = ctx.citationCount + ctx.quotationCount + ctx.statisticCount;
  const density = factualCount / (ctx.wordCount / 1000);

  if (density >= 2) {
    return { status: "pass", score: max, message: `사실 밀도 ${density.toFixed(2)}로 충분합니다` };
  }
  if (density >= 1) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `사실 밀도 ${density.toFixed(2)}입니다. 2.00 이상을 권장합니다`,
    };
  }
  return { status: "fail", score: 0, message: `사실 밀도 ${density.toFixed(2)}로 낮습니다` };
}

/** #43 콘텐츠 깊이 (10점) */
function checkGeoContentDepth(ctx: AnalysisContext): AnalysisResult {
  const max = 10;

  if (ctx.wordCount >= 2000 && ctx.h2Count >= 3) {
    return {
      status: "pass",
      score: max,
      message: `본문 ${ctx.wordCount}자, H2 ${ctx.h2Count}개로 콘텐츠 깊이가 충분합니다`,
    };
  }
  if (ctx.wordCount >= 1000 || ctx.h2Count >= 2) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `본문 ${ctx.wordCount}자, H2 ${ctx.h2Count}개입니다. 깊이 보강을 권장합니다`,
    };
  }
  return {
    status: "fail",
    score: 0,
    message: `본문 ${ctx.wordCount}자, H2 ${ctx.h2Count}개로 콘텐츠 깊이가 부족합니다`,
  };
}

/** #44 독창적 관점 (8점) */
function checkGeoUniqueInsight(ctx: AnalysisContext): AnalysisResult {
  const max = 8;
  const count = (ctx.bodyText.match(/경험|사례|직접|실무|현장/g) ?? []).length;

  if (count >= 2) {
    return { status: "pass", score: max, message: `독창적 관점 표현이 ${count}회 감지되었습니다` };
  }
  if (count === 1) {
    return {
      status: "partial",
      score: partialScore(max),
      message: "독창적 관점 표현이 1회입니다. 2회 이상을 권장합니다",
    };
  }
  return { status: "fail", score: 0, message: "경험/사례 기반 표현이 없습니다" };
}

/** #45 근거 기반 (8점) */
function checkGeoEvidenceBased(ctx: AnalysisContext): AnalysisResult {
  const max = 8;
  const evidenceCount = ctx.citationCount + ctx.statisticCount;

  if (evidenceCount >= 3) {
    return { status: "pass", score: max, message: `근거 데이터 ${evidenceCount}개로 충분합니다` };
  }
  if (evidenceCount >= 1) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `근거 데이터 ${evidenceCount}개입니다. 3개 이상을 권장합니다`,
    };
  }
  return { status: "fail", score: 0, message: "출처/통계 기반 근거가 부족합니다" };
}

/** #46 논리적 구조 (7점) */
function checkGeoLogicalStructure(ctx: AnalysisContext): AnalysisResult {
  const max = 7;
  const hasLogicalMarker = /(결론|따라서|요약하면|결과적으로)/.test(ctx.bodyText);

  if (hasLogicalMarker) {
    return { status: "pass", score: max, message: "논리 전개 신호어가 포함되어 있습니다" };
  }
  return { status: "fail", score: 0, message: "논리 전개 신호어(결론/따라서 등)가 없습니다" };
}

/** #47 개체명 언급 (8점) */
function checkGeoEntityMention(ctx: AnalysisContext): AnalysisResult {
  const max = 8;
  const normalizedWords = ctx.bodyText
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word.length > 0);

  const englishEntities = normalizedWords.filter((word) => /^[A-Z][A-Za-z]{1,}$/.test(word));
  const koreanEntities = normalizedWords.filter(
    (word) =>
      /^[가-힣]{2,}$/.test(word) &&
      !/[가-힣]{2,}(은|는|이|가|을|를|에|의|도|만|와|과|으로|에서|부터|까지)$/.test(word),
  );

  const entityCount = new Set([...englishEntities, ...koreanEntities]).size;

  if (entityCount >= 2) {
    return { status: "pass", score: max, message: `개체명 ${entityCount}개가 감지되었습니다` };
  }
  if (entityCount === 1) {
    return {
      status: "partial",
      score: partialScore(max),
      message: "개체명 언급이 1개입니다. 2개 이상을 권장합니다",
    };
  }
  return { status: "fail", score: 0, message: "개체명 언급이 부족합니다" };
}

/** #48 최신 업데이트 (8점) */
function checkGeoUpdateRecency(ctx: AnalysisContext): AnalysisResult {
  const max = 8;

  if (!ctx.dateModified) {
    return { status: "fail", score: 0, message: "수정일 정보가 없습니다" };
  }

  const modifiedAt = new Date(ctx.dateModified);
  if (Number.isNaN(modifiedAt.getTime())) {
    return { status: "fail", score: 0, message: "수정일 형식이 올바르지 않습니다" };
  }

  const now = new Date();
  const ageDays = (now.getTime() - modifiedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (ageDays <= 60) {
    return {
      status: "pass",
      score: max,
      message: `최근 ${Math.floor(ageDays)}일 이내 업데이트되어 최신성을 유지합니다`,
    };
  }
  if (ageDays <= 120) {
    return {
      status: "partial",
      score: partialScore(max),
      message: `${Math.floor(ageDays)}일 전 업데이트되었습니다. 최신화 권장 구간입니다`,
    };
  }
  return {
    status: "fail",
    score: 0,
    message: `${Math.floor(ageDays)}일 전 업데이트되었습니다. 최신 업데이트가 필요합니다`,
  };
}

// ============================================================================
// 분석 규칙 배열
// ============================================================================

export const ANALYSIS_RULES: AnalysisRule[] = [
  // Content (26점)
  {
    id: "title-length",
    domain: "seo",
    category: "content",
    label: "제목 길이",
    description: "제목이 30~60자 사이인지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkTitleLength,
  },
  {
    id: "body-length",
    domain: "seo",
    category: "content",
    label: "본문 길이",
    description: "본문이 300자 이상인지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkBodyLength,
  },
  {
    id: "has-images",
    domain: "seo",
    category: "content",
    label: "이미지 포함",
    description: "이미지가 1개 이상 포함되었는지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkHasImages,
  },
  {
    id: "image-alt",
    domain: "seo",
    category: "content",
    label: "이미지 alt 텍스트",
    description: "모든 이미지에 alt 텍스트가 있는지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkImageAlt,
  },
  {
    id: "readability",
    domain: "seo",
    category: "content",
    label: "가독성",
    description: "문단당 평균 문장 수가 3~5개인지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkReadability,
  },

  // Meta (13점)
  {
    id: "meta-description",
    domain: "seo",
    category: "meta",
    label: "메타 설명",
    description: "메타 설명이 100~160자 사이인지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkMetaDescription,
  },
  {
    id: "has-slug",
    domain: "seo",
    category: "meta",
    label: "URL slug",
    description: "URL slug이 설정되었는지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkHasSlug,
  },

  // Structure (43점)
  {
    id: "has-headings",
    domain: "seo",
    category: "structure",
    label: "소제목 구조",
    description: "H2/H3 소제목이 있는지 확인합니다",
    maxScore: 7,
    executionType: "client",
    check: checkHasHeadings,
  },
  {
    id: "keyword-title",
    domain: "seo",
    category: "structure",
    label: "키워드-제목",
    description: "제목에 SEO 키워드가 포함되었는지 확인합니다",
    maxScore: 7,
    executionType: "client",
    check: checkKeywordTitle,
  },
  {
    id: "keyword-subheading",
    domain: "seo",
    category: "structure",
    label: "키워드-소제목",
    description: "소제목에 SEO 키워드가 포함되었는지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkKeywordSubheading,
  },
  {
    id: "keyword-first-para",
    domain: "seo",
    category: "structure",
    label: "키워드-첫 문단",
    description: "첫 문단(100자)에 SEO 키워드가 포함되었는지 확인합니다",
    maxScore: 7,
    executionType: "client",
    check: checkKeywordFirstPara,
  },
  {
    id: "keyword-density",
    domain: "seo",
    category: "structure",
    label: "키워드 밀도",
    description: "키워드 밀도가 1~3% 사이인지 확인합니다",
    maxScore: 7,
    executionType: "client",
    check: checkKeywordDensity,
  },
  {
    id: "keyword-meta",
    domain: "seo",
    category: "structure",
    label: "키워드-메타 설명",
    description: "메타 설명에 SEO 키워드가 포함되었는지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkKeywordMeta,
  },
  {
    id: "keyword-slug",
    domain: "seo",
    category: "structure",
    label: "키워드-slug",
    description: "URL slug에 SEO 키워드가 포함되었는지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkKeywordSlug,
  },

  // Link (13점)
  {
    id: "internal-links",
    domain: "seo",
    category: "link",
    label: "내부 링크",
    description: "내부 링크가 1개 이상 포함되었는지 확인합니다",
    maxScore: 7,
    executionType: "client",
    check: checkInternalLinks,
  },
  {
    id: "external-links",
    domain: "seo",
    category: "link",
    label: "외부 링크",
    description: "외부 링크가 1개 이상 포함되었는지 확인합니다",
    maxScore: 6,
    executionType: "client",
    check: checkExternalLinks,
  },

  // 신규 SEO 규칙 (Phase 1, 45점)
  {
    id: "seo-title-set",
    domain: "seo",
    category: "meta",
    label: "SEO 전용 제목",
    description: "SEO 제목이 일반 제목과 다르게 설정되었는지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkSeoTitleSet,
  },
  {
    id: "keyword-density-balance",
    domain: "seo",
    category: "structure",
    label: "키워드 균형",
    description: "키워드 밀도 과다(>5%)/과소(<0.5%) 여부를 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkKeywordDensityBalance,
  },
  {
    id: "paragraph-length",
    domain: "seo",
    category: "content",
    label: "단락 길이",
    description: "각 단락이 300자 이내인지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkParagraphLength,
  },
  {
    id: "content-freshness",
    domain: "seo",
    category: "content",
    label: "콘텐츠 신선도",
    description: "마지막 수정일이 90일 이내인지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkContentFreshness,
  },
  {
    id: "og-image",
    domain: "seo",
    category: "meta",
    label: "OG 이미지",
    description: "OG용 썸네일 이미지가 설정되었는지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkOgImage,
  },
  {
    id: "heading-hierarchy",
    domain: "seo",
    category: "structure",
    label: "헤딩 계층",
    description: "H2 이후에 H3가 배치되는지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkHeadingHierarchy,
  },
  {
    id: "link-text-descriptive",
    domain: "seo",
    category: "link",
    label: "링크 텍스트 품질",
    description: "링크 텍스트가 충분히 서술적인지 확인합니다",
    maxScore: 5,
    executionType: "client",
    check: checkLinkTextDescriptive,
  },
  {
    id: "eeat-author",
    domain: "seo",
    category: "content",
    label: "저자 정보",
    description: "저자 정보(authorName)가 설정되었는지 확인합니다",
    maxScore: 10,
    executionType: "client",
    check: checkEeatAuthor,
  },

  // AEO (100점)
  {
    id: "aeo-faq-presence",
    domain: "aeo",
    category: "answer",
    label: "FAQ 섹션",
    description: "FAQ 섹션이 최소 1개 이상 포함되어 있는지 확인합니다",
    maxScore: 10,
    executionType: "client",
    check: checkAeoFaqPresence,
  },
  {
    id: "aeo-faq-quality",
    domain: "aeo",
    category: "answer",
    label: "FAQ 답변 품질",
    description: "FAQ 답변의 평균 길이가 적정 범위(50~200자)인지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkAeoFaqQuality,
  },
  {
    id: "aeo-question-headings",
    domain: "aeo",
    category: "answer",
    label: "질문형 제목",
    description: "질문형 제목이 2개 이상 포함되어 있는지 확인합니다",
    maxScore: 10,
    executionType: "client",
    check: checkAeoQuestionHeadings,
  },
  {
    id: "aeo-direct-answer",
    domain: "aeo",
    category: "answer",
    label: "직접 답변",
    description: "첫 100자에 마침표를 포함한 핵심 답변 문장이 있는지 확인합니다",
    maxScore: 10,
    executionType: "client",
    check: checkAeoDirectAnswer,
  },
  {
    id: "aeo-structured-lists",
    domain: "aeo",
    category: "structure",
    label: "구조화 목록",
    description: "목록 항목이 3개 이상으로 구조화되어 있는지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkAeoStructuredLists,
  },
  {
    id: "aeo-data-table",
    domain: "aeo",
    category: "structure",
    label: "데이터 테이블",
    description: "마크다운 테이블이 1개 이상 포함되어 있는지 확인합니다",
    maxScore: 7,
    executionType: "client",
    check: checkAeoDataTable,
  },
  {
    id: "aeo-definition-pattern",
    domain: "aeo",
    category: "answer",
    label: "정의 패턴",
    description: "~는/~이란/~의미는 정의 패턴이 충분히 사용되었는지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkAeoDefinitionPattern,
  },
  {
    id: "aeo-step-pattern",
    domain: "aeo",
    category: "structure",
    label: "단계별 설명",
    description: "단계형 전개 표현이 2회 이상 사용되었는지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkAeoStepPattern,
  },
  {
    id: "aeo-concise-sentences",
    domain: "aeo",
    category: "format",
    label: "간결 문장",
    description: "문장 평균 길이가 40자 이하인지 확인합니다",
    maxScore: 7,
    executionType: "client",
    check: checkAeoConciseSentences,
  },
  {
    id: "aeo-how-what-why",
    domain: "aeo",
    category: "answer",
    label: "How/What/Why 커버",
    description: "어떻게/무엇/왜 키워드가 2종 이상 포함되었는지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkAeoHowWhatWhy,
  },
  {
    id: "aeo-summary-present",
    domain: "aeo",
    category: "format",
    label: "요약 섹션",
    description: "요약/정리/핵심 키워드 라인이 포함되었는지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkAeoSummaryPresent,
  },
  {
    id: "aeo-answer-depth",
    domain: "aeo",
    category: "answer",
    label: "답변 깊이",
    description: "FAQ 답변 평균 길이가 150자 이상인지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkAeoAnswerDepth,
  },

  // GEO (100점)
  {
    id: "geo-source-citation",
    domain: "geo",
    category: "authority",
    label: "출처 인용",
    description: "출처 인용이 2회 이상인지 확인합니다",
    maxScore: 10,
    executionType: "client",
    check: checkGeoSourceCitation,
  },
  {
    id: "geo-expert-quote",
    domain: "geo",
    category: "authority",
    label: "전문가 인용",
    description: "따옴표 기반 인용문이 1개 이상인지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkGeoExpertQuote,
  },
  {
    id: "geo-statistics",
    domain: "geo",
    category: "authority",
    label: "통계 데이터",
    description: "통계 수치 패턴이 3개 이상 포함되었는지 확인합니다",
    maxScore: 10,
    executionType: "client",
    check: checkGeoStatistics,
  },
  {
    id: "geo-vocabulary-diversity",
    domain: "geo",
    category: "quality",
    label: "어휘 다양성",
    description: "고유 어절 비율이 0.40 이상인지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkGeoVocabularyDiversity,
  },
  {
    id: "geo-publish-date",
    domain: "geo",
    category: "freshness",
    label: "발행일 표기",
    description: "발행일(datePublished)이 설정되어 있는지 확인합니다",
    maxScore: 7,
    executionType: "client",
    check: checkGeoPublishDate,
  },
  {
    id: "geo-factual-density",
    domain: "geo",
    category: "authority",
    label: "사실 밀도",
    description: "1,000자당 사실 근거 밀도가 2 이상인지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkGeoFactualDensity,
  },
  {
    id: "geo-content-depth",
    domain: "geo",
    category: "quality",
    label: "콘텐츠 깊이",
    description: "본문 길이와 H2 개수 기준으로 콘텐츠 깊이를 평가합니다",
    maxScore: 10,
    executionType: "client",
    check: checkGeoContentDepth,
  },
  {
    id: "geo-unique-insight",
    domain: "geo",
    category: "quality",
    label: "독창적 관점",
    description: "경험/사례/직접 등의 고유 관점 패턴이 포함되었는지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkGeoUniqueInsight,
  },
  {
    id: "geo-evidence-based",
    domain: "geo",
    category: "authority",
    label: "근거 기반",
    description: "출처 인용과 통계 데이터 합이 3개 이상인지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkGeoEvidenceBased,
  },
  {
    id: "geo-logical-structure",
    domain: "geo",
    category: "quality",
    label: "논리적 구조",
    description: "결론/따라서/요약하면/결과적으로 신호어가 포함되었는지 확인합니다",
    maxScore: 7,
    executionType: "client",
    check: checkGeoLogicalStructure,
  },
  {
    id: "geo-entity-mention",
    domain: "geo",
    category: "authority",
    label: "개체명 언급",
    description: "고유명사 형태의 개체명이 2개 이상 언급되는지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkGeoEntityMention,
  },
  {
    id: "geo-update-recency",
    domain: "geo",
    category: "freshness",
    label: "최신 업데이트",
    description: "수정일(dateModified)이 60일 이내인지 확인합니다",
    maxScore: 8,
    executionType: "client",
    check: checkGeoUpdateRecency,
  },
];

// ============================================================================
// 점수 계산 엔진
// ============================================================================

/**
 * 통합 분석 점수를 계산한다.
 *
 * - 규칙 실행 결과를 도메인별로 집계한다.
 * - 규칙이 존재하는 도메인만 가중치에 포함해 총점을 계산한다.
 */
export function calculateScores(rules: AnalysisRule[], ctx: AnalysisContext): CalculatedScores {
  const results: Array<{ rule: AnalysisRule; result: AnalysisResult }> = rules.map((rule) => ({
    rule,
    result: rule.check(ctx),
  }));

  const domainScores: Record<AnalysisDomain, DomainScore> = {
    seo: { score: 0, maxScore: 0, percentage: 0 },
    aeo: { score: 0, maxScore: 0, percentage: 0 },
    geo: { score: 0, maxScore: 0, percentage: 0 },
  };

  for (const { rule, result } of results) {
    domainScores[rule.domain].score += result.score;
    domainScores[rule.domain].maxScore += rule.maxScore;
  }

  const domains: AnalysisDomain[] = ["seo", "aeo", "geo"];
  for (const domain of domains) {
    const { score, maxScore } = domainScores[domain];
    domainScores[domain].percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  }

  const activeDomains = domains.filter((domain) => domainScores[domain].maxScore > 0);
  if (activeDomains.length === 0) {
    return {
      totalScore: 0,
      domainScores,
      results,
    };
  }

  const activeWeightSum = activeDomains.reduce((sum, domain) => sum + DOMAIN_WEIGHTS[domain], 0);

  const totalScore = activeDomains.reduce((sum, domain) => {
    const normalizedWeight = DOMAIN_WEIGHTS[domain] / activeWeightSum;
    return sum + domainScores[domain].percentage * normalizedWeight;
  }, 0);

  return {
    totalScore,
    domainScores,
    results,
  };
}
