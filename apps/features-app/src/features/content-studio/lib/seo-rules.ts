/**
 * @deprecated 이 모듈은 analysis-rules.ts의 통합 분석 엔진으로 대체되었습니다.
 * SEO/AEO/GEO 3도메인 통합 스코어링은 analysis-rules.ts를 사용하세요.
 * 하위 호환성을 위해 유지하며, 향후 제거 예정입니다.
 *
 * @see {@link ./analysis-rules.ts} 통합 분석 엔진
 *
 * SEO 규칙 시스템 (Legacy)
 *
 * 확장 가능한 SEO 분석 엔진. 새 규칙 추가 = 함수 하나 + SEO_RULES 배열에 push.
 * 총 16개 규칙, 100점 만점.
 */

// ============================================================================
// Types
// ============================================================================

export interface SeoRule {
  id: string;
  category: "content" | "meta" | "structure" | "link";
  label: string;
  description: string;
  maxScore: number;
  check: (ctx: SeoContext) => SeoCheckResult;
}

export interface SeoContext {
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
}

export interface SeoCheckResult {
  status: "pass" | "partial" | "fail";
  score: number;
  message: string;
}

// ============================================================================
// buildSeoContext 헬퍼
// ============================================================================

export function buildSeoContext(params: {
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
}): SeoContext {
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
  };
}

// ============================================================================
// 점수 헬퍼
// ============================================================================

/** partial 점수 = maxScore의 절반 반올림 */
function partialScore(maxScore: number): number {
  return Math.round(maxScore / 2);
}

// ============================================================================
// 규칙 정의 (16개, 총 100점)
// ============================================================================

// --- Content 카테고리 ---

/** #1 제목 길이 (8점) */
function checkTitleLength(ctx: SeoContext): SeoCheckResult {
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
function checkBodyLength(ctx: SeoContext): SeoCheckResult {
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
function checkHasImages(ctx: SeoContext): SeoCheckResult {
  const max = 5;

  if (ctx.imageCount >= 1) {
    return { status: "pass", score: max, message: `이미지 ${ctx.imageCount}개가 포함되어 있습니다` };
  }
  return { status: "fail", score: 0, message: "이미지가 없습니다. 최소 1개 이상 추가하세요" };
}

/** #4 이미지 alt 텍스트 (5점) */
function checkImageAlt(ctx: SeoContext): SeoCheckResult {
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
function checkReadability(ctx: SeoContext): SeoCheckResult {
  const max = 5;

  if (ctx.paragraphs.length === 0) {
    return { status: "fail", score: 0, message: "분석할 문단이 없습니다" };
  }

  // 각 문단의 문장 수 계산 (`.` `?` `!` 기준)
  const sentenceCounts = ctx.paragraphs.map((p) => {
    const sentences = p.split(/[.?!]+/).filter((s) => s.trim().length > 0);
    return sentences.length;
  });
  const avgSentences =
    sentenceCounts.reduce((sum, c) => sum + c, 0) / sentenceCounts.length;

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
function checkMetaDescription(ctx: SeoContext): SeoCheckResult {
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
function checkHasSlug(ctx: SeoContext): SeoCheckResult {
  const max = 5;

  if (ctx.slug && ctx.slug.trim().length > 0) {
    return { status: "pass", score: max, message: "URL slug이 설정되어 있습니다" };
  }
  return { status: "fail", score: 0, message: "URL slug이 없습니다. slug을 설정하세요" };
}

// --- Structure 카테고리 ---

/** #8 H2/H3 소제목 (7점) */
function checkHasHeadings(ctx: SeoContext): SeoCheckResult {
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
function checkKeywordTitle(ctx: SeoContext): SeoCheckResult {
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
function checkKeywordSubheading(ctx: SeoContext): SeoCheckResult {
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
function checkKeywordFirstPara(ctx: SeoContext): SeoCheckResult {
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
function checkKeywordDensity(ctx: SeoContext): SeoCheckResult {
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
function checkKeywordMeta(ctx: SeoContext): SeoCheckResult {
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
function checkKeywordSlug(ctx: SeoContext): SeoCheckResult {
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
function checkInternalLinks(ctx: SeoContext): SeoCheckResult {
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
function checkExternalLinks(ctx: SeoContext): SeoCheckResult {
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

// ============================================================================
// SEO 규칙 배열 (새 규칙 추가 시 여기에 push)
// ============================================================================

export const SEO_RULES: SeoRule[] = [
  // Content (26점)
  {
    id: "title-length",
    category: "content",
    label: "제목 길이",
    description: "제목이 30~60자 사이인지 확인합니다",
    maxScore: 8,
    check: checkTitleLength,
  },
  {
    id: "body-length",
    category: "content",
    label: "본문 길이",
    description: "본문이 300자 이상인지 확인합니다",
    maxScore: 8,
    check: checkBodyLength,
  },
  {
    id: "has-images",
    category: "content",
    label: "이미지 포함",
    description: "이미지가 1개 이상 포함되었는지 확인합니다",
    maxScore: 5,
    check: checkHasImages,
  },
  {
    id: "image-alt",
    category: "content",
    label: "이미지 alt 텍스트",
    description: "모든 이미지에 alt 텍스트가 있는지 확인합니다",
    maxScore: 5,
    check: checkImageAlt,
  },
  {
    id: "readability",
    category: "content",
    label: "가독성",
    description: "문단당 평균 문장 수가 3~5개인지 확인합니다",
    maxScore: 5,
    check: checkReadability,
  },

  // Meta (13점)
  {
    id: "meta-description",
    category: "meta",
    label: "메타 설명",
    description: "메타 설명이 100~160자 사이인지 확인합니다",
    maxScore: 8,
    check: checkMetaDescription,
  },
  {
    id: "has-slug",
    category: "meta",
    label: "URL slug",
    description: "URL slug이 설정되었는지 확인합니다",
    maxScore: 5,
    check: checkHasSlug,
  },

  // Structure (43점)
  {
    id: "has-headings",
    category: "structure",
    label: "소제목 구조",
    description: "H2/H3 소제목이 있는지 확인합니다",
    maxScore: 7,
    check: checkHasHeadings,
  },
  {
    id: "keyword-title",
    category: "structure",
    label: "키워드-제목",
    description: "제목에 SEO 키워드가 포함되었는지 확인합니다",
    maxScore: 7,
    check: checkKeywordTitle,
  },
  {
    id: "keyword-subheading",
    category: "structure",
    label: "키워드-소제목",
    description: "소제목에 SEO 키워드가 포함되었는지 확인합니다",
    maxScore: 5,
    check: checkKeywordSubheading,
  },
  {
    id: "keyword-first-para",
    category: "structure",
    label: "키워드-첫 문단",
    description: "첫 문단(100자)에 SEO 키워드가 포함되었는지 확인합니다",
    maxScore: 7,
    check: checkKeywordFirstPara,
  },
  {
    id: "keyword-density",
    category: "structure",
    label: "키워드 밀도",
    description: "키워드 밀도가 1~3% 사이인지 확인합니다",
    maxScore: 7,
    check: checkKeywordDensity,
  },
  {
    id: "keyword-meta",
    category: "structure",
    label: "키워드-메타 설명",
    description: "메타 설명에 SEO 키워드가 포함되었는지 확인합니다",
    maxScore: 5,
    check: checkKeywordMeta,
  },
  {
    id: "keyword-slug",
    category: "structure",
    label: "키워드-slug",
    description: "URL slug에 SEO 키워드가 포함되었는지 확인합니다",
    maxScore: 5,
    check: checkKeywordSlug,
  },

  // Link (13점)
  {
    id: "internal-links",
    category: "link",
    label: "내부 링크",
    description: "내부 링크가 1개 이상 포함되었는지 확인합니다",
    maxScore: 7,
    check: checkInternalLinks,
  },
  {
    id: "external-links",
    category: "link",
    label: "외부 링크",
    description: "외부 링크가 1개 이상 포함되었는지 확인합니다",
    maxScore: 6,
    check: checkExternalLinks,
  },
];
