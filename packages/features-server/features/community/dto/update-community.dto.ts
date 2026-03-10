import { z } from "zod";
import { createCommunitySchema } from "./create-community.dto";

export const updateCommunitySchema = createCommunitySchema
  .partial()
  .omit({ slug: true }) // slug는 변경 불가
  .extend({
    automodConfig: z
      .object({
        enableSpamFilter: z.boolean().optional(),
        enableKeywordFilter: z.boolean().optional(),
        minKarmaToPost: z.number().int().min(0).optional(),
        minAccountAge: z.number().int().min(0).optional(),
      })
      .optional()
      .describe("자동 모더레이션 설정"),
    bannedWords: z.array(z.string()).optional().describe("금지 단어 목록"),
  });

export type UpdateCommunityDto = z.infer<typeof updateCommunitySchema>;
