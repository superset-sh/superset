import { z } from "zod";

export const chatMastraSubmitEventTypeSchema = z.enum([
	"user_message_submitted",
	"control_submitted",
	"approval_submitted",
	"question_submitted",
	"plan_submitted",
]);

export const chatMastraSubmitEventSchema = z.object({
	type: chatMastraSubmitEventTypeSchema,
	data: z.unknown(),
});

export const chatMastraEnvelopeSchema = z.object({
	kind: z.enum(["submit", "harness"]),
	sessionId: z.string().uuid(),
	timestamp: z.string(),
	sequenceHint: z.number().int().nonnegative(),
	payload: z.unknown(),
});

export type ChatMastraSubmitEventType = z.infer<
	typeof chatMastraSubmitEventTypeSchema
>;
export type ChatMastraSubmitEvent = z.infer<typeof chatMastraSubmitEventSchema>;
export type ChatMastraEnvelope = z.infer<typeof chatMastraEnvelopeSchema>;
