import { z } from "zod";

export const createSessionProductSchema = z.object({
  name: z.string().min(1).max(200).describe("상품명"),
  description: z.string().optional().describe("상품 설명"),
  durationMinutes: z
    .number()
    .int()
    .min(15)
    .max(480)
    .describe("상담 시간 (분)"),
  price: z.number().int().min(0).describe("가격"),
  currency: z.string().max(3).default("KRW").describe("통화"),
  sortOrder: z.number().int().default(0).describe("정렬 순서"),
});

export type CreateSessionProductDto = z.infer<
  typeof createSessionProductSchema
>;
