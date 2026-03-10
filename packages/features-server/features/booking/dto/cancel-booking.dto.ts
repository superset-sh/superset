import { z } from "zod";

export const cancelBookingSchema = z.object({
  reason: z.string().optional().describe("취소 사유"),
});

export type CancelBookingDto = z.infer<typeof cancelBookingSchema>;
