import { z } from "zod";

export const createCommunitySchema = z.object({
  name: z.string().min(3).max(100).describe("커뮤니티 이름 (3-100자)"),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .describe("URL 슬러그 (소문자, 숫자, 하이픈만 허용)"),
  description: z.string().min(10).max(5000).describe("커뮤니티 설명 (10-5000자)"),
  iconUrl: z.string().url().optional().describe("아이콘 URL"),
  bannerUrl: z.string().url().optional().describe("배너 URL"),
  type: z.enum(["public", "restricted", "private"]).default("public").describe("커뮤니티 유형"),
  isNsfw: z.boolean().default(false).describe("NSFW 커뮤니티 여부"),
  allowImages: z.boolean().default(true).describe("이미지 허용"),
  allowVideos: z.boolean().default(true).describe("비디오 허용"),
  allowPolls: z.boolean().default(true).describe("투표 허용"),
  allowCrosspost: z.boolean().default(true).describe("교차 게시 허용"),
  rules: z
    .array(
      z.object({
        title: z.string().min(1).max(100),
        description: z.string().min(1).max(500),
      })
    )
    .optional()
    .describe("커뮤니티 규칙"),
});

export type CreateCommunityDto = z.infer<typeof createCommunitySchema>;
