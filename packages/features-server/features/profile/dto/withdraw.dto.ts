import { z } from "zod";

export const withdrawInputSchema = z.object({
  reasonType: z.enum([
    "no_longer_use", "lack_features", "difficult_to_use",
    "too_expensive", "found_alternative", "other",
  ]).describe("탈퇴 사유 유형"),
  reasonDetail: z.string().max(500).optional().describe("기타 사유 상세"),
  password: z.string().min(1).describe("비밀번호 확인"),
});

export type WithdrawInput = z.infer<typeof withdrawInputSchema>;
