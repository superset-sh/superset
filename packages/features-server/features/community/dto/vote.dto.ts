import { z } from "zod";

export const voteSchema = z.object({
  targetType: z.enum(["post", "comment"]).describe("투표 대상 유형"),
  targetId: z.string().uuid().describe("투표 대상 ID"),
  vote: z.union([z.literal(1), z.literal(-1)]).describe("1 = upvote, -1 = downvote"),
});

export type VoteDto = z.infer<typeof voteSchema>;

export const removeVoteSchema = z.object({
  targetType: z.enum(["post", "comment"]).describe("투표 대상 유형"),
  targetId: z.string().uuid().describe("투표 대상 ID"),
});

export type RemoveVoteDto = z.infer<typeof removeVoteSchema>;
