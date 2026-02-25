import { z } from "zod";

export const startInput = z.object({
	organizationId: z.string(),
});

export const searchFilesInput = z.object({
	rootPath: z.string(),
	query: z.string(),
	includeHidden: z.boolean().default(false),
	limit: z.number().default(20),
});

export const sessionIdInput = z.object({
	sessionId: z.uuid(),
});

export const workspaceIdInput = z.object({
	workspaceId: z.uuid(),
});

export const ensureRuntimeInput = z.object({
	sessionId: z.uuid(),
	cwd: z.string().optional(),
	workspaceId: z.uuid().optional(),
});

export const sendMessageInput = z.object({
	sessionId: z.uuid(),
	content: z.string().optional(),
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

export const controlInput = z.object({
	sessionId: z.uuid(),
	action: z.enum(["stop", "abort"]),
});

export const approvalRespondInput = z.object({
	sessionId: z.uuid(),
	decision: z.enum(["approve", "deny"]),
	toolCallId: z.string().optional(),
});

export const questionRespondInput = z.object({
	sessionId: z.uuid(),
	questionId: z.string(),
	answer: z.string(),
});

export const planRespondInput = z.object({
	sessionId: z.uuid(),
	planId: z.string(),
	action: z.enum(["accept", "reject", "revise"]),
	feedback: z.string().optional(),
});

export const createSessionInput = z.object({
	workspaceId: z.uuid(),
	sessionId: z.uuid().optional(),
	title: z.string().trim().min(1).max(140).optional(),
});

export type StartInput = z.infer<typeof startInput>;
export type SearchFilesInput = z.infer<typeof searchFilesInput>;
export type SessionIdInput = z.infer<typeof sessionIdInput>;
export type WorkspaceIdInput = z.infer<typeof workspaceIdInput>;
export type EnsureRuntimeInput = z.infer<typeof ensureRuntimeInput>;
export type SendMessageInput = z.infer<typeof sendMessageInput>;
export type ControlInput = z.infer<typeof controlInput>;
export type ApprovalRespondInput = z.infer<typeof approvalRespondInput>;
export type QuestionRespondInput = z.infer<typeof questionRespondInput>;
export type PlanRespondInput = z.infer<typeof planRespondInput>;
export type CreateSessionInput = z.infer<typeof createSessionInput>;
