import { z } from "zod";

// Campaign DTOs
export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200).describe("캠페인명"),
  description: z.string().max(2000).optional().describe("캠페인 설명"),
  startsAt: z.string().datetime().optional().describe("시작일"),
  endsAt: z.string().datetime().optional().describe("종료일"),
  tags: z.array(z.string()).max(20).optional().describe("태그"),
});
export type CreateCampaignDto = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: z.enum(["draft", "active", "paused", "completed", "archived"]).optional().describe("상태"),
});
export type UpdateCampaignDto = z.infer<typeof updateCampaignSchema>;

// Content DTOs
export const createContentSchema = z.object({
  campaignId: z.string().uuid().optional().describe("소속 캠페인 ID"),
  title: z.string().min(1).max(200).describe("콘텐츠 제목"),
  body: z.string().min(1).describe("본문"),
  images: z.array(z.string().url()).max(10).optional().describe("이미지 URL 배열"),
  linkUrl: z.string().url().optional().describe("공유 링크"),
  tags: z.array(z.string()).max(30).optional().describe("해시태그"),
});
export type CreateContentDto = z.infer<typeof createContentSchema>;

export const updateContentSchema = createContentSchema.partial();
export type UpdateContentDto = z.infer<typeof updateContentSchema>;

export const createContentFromSourceSchema = z.object({
  sourceType: z.enum(["board_post", "community_post", "content_studio"]).describe("소스 유형"),
  sourceId: z.string().uuid().describe("소스 콘텐츠 ID"),
  campaignId: z.string().uuid().optional().describe("소속 캠페인"),
});
export type CreateContentFromSourceDto = z.infer<typeof createContentFromSourceSchema>;

// Variant DTOs
export const generateVariantsSchema = z.object({
  contentId: z.string().uuid().describe("원본 콘텐츠 ID"),
  platforms: z.array(z.enum(["facebook", "instagram", "threads", "x", "linkedin"])).min(1).describe("변환할 플랫폼"),
});
export type GenerateVariantsDto = z.infer<typeof generateVariantsSchema>;

// Account DTOs
export const connectAccountSchema = z.object({
  platform: z.enum(["facebook", "instagram", "threads", "x", "linkedin"]).describe("SNS 플랫폼"),
  authCode: z.string().describe("OAuth 인증 코드"),
  redirectUri: z.string().url().describe("OAuth 리디렉트 URI"),
});
export type ConnectAccountDto = z.infer<typeof connectAccountSchema>;

// Publish DTOs
export const publishNowSchema = z.object({
  contentId: z.string().uuid().describe("발행할 콘텐츠 ID"),
  platforms: z.array(z.enum(["facebook", "instagram", "threads", "x", "linkedin"])).min(1).describe("발행 플랫폼"),
  accountIds: z.record(z.string(), z.string().uuid()).describe("플랫폼별 계정 ID"),
});
export type PublishNowDto = z.infer<typeof publishNowSchema>;

export const schedulePublishSchema = publishNowSchema.extend({
  scheduledAt: z.string().datetime().describe("예약 발행 시간"),
});
export type SchedulePublishDto = z.infer<typeof schedulePublishSchema>;
