import { z } from "zod";

export const openSessionBodySchema = z.object({
	sessionId: z.uuid().optional(),
	cwd: z.string().optional(),
	config: z
		.object({
			storage: z
				.object({
					url: z.string(),
					authToken: z.string().optional(),
				})
				.optional(),
			initialState: z.record(z.string(), z.unknown()).optional(),
			disableMcp: z.boolean().optional(),
			disableHooks: z.boolean().optional(),
		})
		.optional(),
});

export const sendMessageBodySchema = z.object({
	content: z.string().default(""),
	files: z
		.array(
			z.object({
				url: z.string(),
				mediaType: z.string(),
				filename: z.string().optional(),
			}),
		)
		.optional(),
	metadata: z
		.object({
			model: z.string().optional(),
			permissionMode: z.string().optional(),
			thinkingEnabled: z.boolean().optional(),
		})
		.optional(),
	clientMessageId: z.string().optional(),
});

export const controlBodySchema = z.object({
	action: z.enum(["stop", "abort"]),
});

export const approvalBodySchema = z.object({
	decision: z.enum(["approve", "deny", "always_allow_category"]),
	toolCallId: z.string().optional(),
});

export const questionBodySchema = z.object({
	questionId: z.string(),
	answer: z.string(),
});

export const planBodySchema = z.object({
	planId: z.string(),
	action: z.enum(["accept", "reject", "revise"]),
	feedback: z.string().optional(),
});

export const crashBodySchema = z.object({
	exitCode: z.number().int().default(1),
	delayMs: z.number().int().nonnegative().default(100),
});

export const logsQuerySchema = z.object({
	sessionId: z.uuid().optional(),
	limit: z.coerce.number().int().positive().max(5000).default(200),
});

export type OpenSessionBody = z.infer<typeof openSessionBodySchema>;
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;
export type ControlBody = z.infer<typeof controlBodySchema>;
export type ApprovalBody = z.infer<typeof approvalBodySchema>;
export type QuestionBody = z.infer<typeof questionBodySchema>;
export type PlanBody = z.infer<typeof planBodySchema>;
export type CrashBody = z.infer<typeof crashBodySchema>;
export type LogsQuery = z.infer<typeof logsQuerySchema>;
