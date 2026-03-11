import type { createMastraCode } from "mastracode";
import { z } from "zod";

type Harness = Awaited<ReturnType<typeof createMastraCode>>["harness"];
type SendMessagePayload = Parameters<Harness["sendMessage"]>[0];
type ApprovalPayload = Parameters<Harness["respondToToolApproval"]>[0];
type QuestionPayload = Parameters<Harness["respondToQuestion"]>[0];
type PlanPayload = Parameters<Harness["respondToPlanApproval"]>[0];

export const searchFilesInput = z.object({
	rootPath: z.string(),
	query: z.string(),
	includeHidden: z.boolean().default(false),
	limit: z.number().default(20),
});

export const mcpOverviewInput = z.object({
	sessionId: z.uuid(),
	cwd: z.string().optional(),
});

export const mcpServerAuthInput = z.object({
	sessionId: z.uuid(),
	cwd: z.string().optional(),
	serverName: z.string().min(1),
});

export const sessionIdInput = z.object({
	sessionId: z.uuid(),
	cwd: z.string().optional(),
});

export const sendMessagePayloadSchema = z.object({
	content: z.string(),
	files: z
		.array(
			z.object({
				data: z.string(),
				mediaType: z.string(),
				filename: z.string().optional(),
			}),
		)
		.optional(),
}) satisfies z.ZodType<SendMessagePayload>;

export const approvalPayloadSchema = z.object({
	decision: z.enum(["approve", "decline", "always_allow_category"]),
}) satisfies z.ZodType<ApprovalPayload>;

export const questionPayloadSchema = z.object({
	questionId: z.string(),
	answer: z.string(),
}) satisfies z.ZodType<QuestionPayload>;

export const planPayloadSchema = z.object({
	planId: z.string(),
	response: z.object({
		action: z.enum(["approved", "rejected"]),
		feedback: z.string().optional(),
	}),
}) satisfies z.ZodType<PlanPayload>;

export const displayStateInput = z.object({
	sessionId: z.uuid(),
	cwd: z.string().optional(),
});

export const listMessagesInput = z.object({
	sessionId: z.uuid(),
	cwd: z.string().optional(),
});

export const sendMessageInput = z.object({
	sessionId: z.uuid(),
	cwd: z.string().optional(),
	payload: sendMessagePayloadSchema,
	metadata: z
		.object({
			model: z.string().optional(),
		})
		.optional(),
});

export const restartFromMessageInput = z.object({
	sessionId: z.uuid(),
	cwd: z.string().optional(),
	messageId: z.string().min(1),
	payload: sendMessagePayloadSchema,
	metadata: z
		.object({
			model: z.string().optional(),
		})
		.optional(),
});

export const approvalRespondInput = z.object({
	sessionId: z.uuid(),
	cwd: z.string().optional(),
	payload: approvalPayloadSchema,
});

export const questionRespondInput = z.object({
	sessionId: z.uuid(),
	cwd: z.string().optional(),
	payload: questionPayloadSchema,
});

export const planRespondInput = z.object({
	sessionId: z.uuid(),
	cwd: z.string().optional(),
	payload: planPayloadSchema,
});

export type SearchFilesInput = z.infer<typeof searchFilesInput>;
export type McpOverviewInput = z.infer<typeof mcpOverviewInput>;
export type McpServerAuthInput = z.infer<typeof mcpServerAuthInput>;
export type SessionIdInput = z.infer<typeof sessionIdInput>;
export type SendMessagePayloadInput = z.infer<typeof sendMessagePayloadSchema>;
export type ApprovalPayloadInput = z.infer<typeof approvalPayloadSchema>;
export type QuestionPayloadInput = z.infer<typeof questionPayloadSchema>;
export type PlanPayloadInput = z.infer<typeof planPayloadSchema>;
export type DisplayStateInput = z.infer<typeof displayStateInput>;
export type ListMessagesInput = z.infer<typeof listMessagesInput>;
export type SendMessageInput = z.infer<typeof sendMessageInput>;
export type RestartFromMessageInput = z.infer<typeof restartFromMessageInput>;
export type ApprovalRespondInput = z.infer<typeof approvalRespondInput>;
export type QuestionRespondInput = z.infer<typeof questionRespondInput>;
export type PlanRespondInput = z.infer<typeof planRespondInput>;
