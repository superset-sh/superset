import { z } from "zod";

export const createPostSchema = z
  .object({
    communityId: z.string().uuid().describe("커뮤니티 ID"),
    title: z.string().min(1).max(300).describe("게시물 제목"),
    type: z.enum(["text", "link", "image", "video", "poll"]).describe("게시물 유형"),

    // Text post
    content: z.string().optional().describe("텍스트 내용"),

    // Link post
    linkUrl: z.string().url().optional().describe("링크 URL"),

    // Image/Video post
    mediaUrls: z.array(z.string().url()).optional().describe("미디어 URL 배열"),

    // Poll post
    pollData: z
      .object({
        options: z.array(
          z.object({
            id: z.string(),
            text: z.string().min(1).max(100),
            voteCount: z.number().int().default(0),
          })
        ),
        multipleChoice: z.boolean().default(false),
        expiresAt: z.string().datetime().optional(),
      })
      .optional()
      .describe("투표 데이터"),

    // Metadata
    flairId: z.string().uuid().optional().describe("플레어 ID"),
    isNsfw: z.boolean().default(false).describe("NSFW 콘텐츠"),
    isSpoiler: z.boolean().default(false).describe("스포일러 콘텐츠"),
    isOc: z.boolean().default(false).describe("Original Content"),

    // Crosspost
    crosspostParentId: z.string().uuid().optional().describe("교차 게시 원본 ID"),
  })
  .refine(
    (data) => {
      // Validate based on post type
      if (data.type === "text") {
        return !!data.content;
      }
      if (data.type === "link") {
        return !!data.linkUrl;
      }
      if (data.type === "image" || data.type === "video") {
        return !!data.mediaUrls && data.mediaUrls.length > 0;
      }
      if (data.type === "poll") {
        return !!data.pollData && data.pollData.options.length >= 2;
      }
      return true;
    },
    {
      message: "Invalid data for post type",
    }
  );

export type CreatePostDto = z.infer<typeof createPostSchema>;
