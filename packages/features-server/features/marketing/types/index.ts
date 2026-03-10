import type {
  MarketingCampaign,
  MarketingContent,
  MarketingPlatformVariant,
  MarketingPublication,
  SnsPlatform,
} from "@superbuilder/drizzle";

// 캠페인 + 통계
export interface CampaignWithStats extends MarketingCampaign {
  contentCount: number;
  publishedCount: number;
}

// 콘텐츠 상세 (variants + publications + author)
export interface ContentWithDetails extends MarketingContent {
  authorName: string | null;
  authorAvatar: string | null;
  variants: MarketingPlatformVariant[];
  publications: MarketingPublication[];
}

// 다른 Feature → 마케팅 콘텐츠 변환 초안
export interface MarketingContentDraft {
  title: string;
  body: string;
  images: string[];
  tags: string[];
  linkUrl: string;
}

// 플랫폼 제약사항
export interface PlatformConstraints {
  platform: SnsPlatform;
  maxCharacters: number;
  maxImages: number;
  requiresImage: boolean;
  supportedMediaTypes: string[];
  maxHashtags: number;
  recommendedImageSize: string;
}

// 발행 결과
export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  platformPostUrl?: string;
  errorMessage?: string;
}

// 페이지네이션 — @superbuilder/features-shared에서 re-export
export type { PaginationInput, PaginatedResult } from "../../../shared/types";

// 캘린더 이벤트
export interface CalendarEvent {
  id: string;
  title: string;
  platform: SnsPlatform;
  scheduledAt: string;
  status: string;
  contentId: string;
}
