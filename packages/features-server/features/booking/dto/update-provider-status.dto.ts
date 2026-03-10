import { z } from "zod";

export const updateProviderStatusSchema = z.object({
  status: z
    .enum(["active", "inactive", "suspended"])
    .describe("상담사 상태"),
  reason: z.string().optional().describe("상태 변경 사유"),
});

export type UpdateProviderStatusDto = z.infer<
  typeof updateProviderStatusSchema
>;
