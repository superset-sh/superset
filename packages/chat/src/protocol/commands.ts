import { z } from "zod";
import { cursorSchema } from "./cursor";
import { decisionSchema, userContentSchema } from "./items";

const commandBaseFields = {
	commandId: z.uuid(),
	sessionId: z.string().min(1),
};

export const createSessionInputSchema = z.object({
	commandId: z.uuid(),
	workspaceId: z.string().min(1),
	harness: z.string().min(1),
	modeId: z.string().optional(),
	modelId: z.string().optional(),
});
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;

export const promptInputSchema = z.object({
	...commandBaseFields,
	clientId: z.string().min(1),
	content: z.array(userContentSchema).min(1),
});
export type PromptInput = z.infer<typeof promptInputSchema>;

export const steerInputSchema = z.object({
	...commandBaseFields,
	expectedTurnId: z.string().min(1),
	content: z.array(userContentSchema).min(1),
});
export type SteerInput = z.infer<typeof steerInputSchema>;

export const cancelTurnInputSchema = z.object({
	...commandBaseFields,
	turnId: z.string().min(1),
});
export type CancelTurnInput = z.infer<typeof cancelTurnInputSchema>;

export const respondToApprovalInputSchema = z.object({
	...commandBaseFields,
	approvalId: z.string().min(1),
	decision: decisionSchema,
});
export type RespondToApprovalInput = z.infer<
	typeof respondToApprovalInputSchema
>;

export const setModeInputSchema = z.object({
	...commandBaseFields,
	modeId: z.string().min(1),
});
export type SetModeInput = z.infer<typeof setModeInputSchema>;

export const setModelInputSchema = z.object({
	...commandBaseFields,
	modelId: z.string().min(1),
});
export type SetModelInput = z.infer<typeof setModelInputSchema>;

export const setConfigOptionInputSchema = z.object({
	...commandBaseFields,
	optionId: z.string().min(1),
	value: z.unknown(),
});
export type SetConfigOptionInput = z.infer<typeof setConfigOptionInputSchema>;

export const forkSessionInputSchema = z.object({
	...commandBaseFields,
	fromItemId: z.string().min(1).optional(),
	harness: z.string().min(1).optional(),
});
export type ForkSessionInput = z.infer<typeof forkSessionInputSchema>;

export const getSessionInputSchema = z.object({ sessionId: z.string().min(1) });
export type GetSessionInput = z.infer<typeof getSessionInputSchema>;

export const listSessionsInputSchema = z.object({
	workspaceId: z.string().min(1).optional(),
	limit: z.number().int().positive().max(200).default(50),
});
export type ListSessionsInput = z.infer<typeof listSessionsInputSchema>;

export const getItemsInputSchema = z.object({
	sessionId: z.string().min(1),
	before: cursorSchema.optional(),
	limit: z.number().int().positive().max(500).default(200),
});
export type GetItemsInput = z.infer<typeof getItemsInputSchema>;
