import { z } from "zod";

export const CODEX_CLIENT_NAME = "superset-chat-runtime";

export const requestIdSchema = z.union([z.string(), z.number()]);
export type CodexRequestId = z.infer<typeof requestIdSchema>;

export const rpcErrorSchema = z.looseObject({
	code: z.number(),
	message: z.string(),
	data: z.unknown().optional(),
});
export type CodexRpcErrorPayload = z.infer<typeof rpcErrorSchema>;

export const incomingFrameSchema = z.looseObject({
	id: requestIdSchema.optional(),
	method: z.string().optional(),
	params: z.unknown().optional(),
	result: z.unknown().optional(),
	error: rpcErrorSchema.optional(),
});
export type CodexIncomingFrame = z.infer<typeof incomingFrameSchema>;

export const initializeResponseSchema = z.looseObject({
	userAgent: z.string(),
	codexHome: z.string().optional(),
	platformOs: z.string().optional(),
});
export type CodexInitializeResponse = z.infer<typeof initializeResponseSchema>;

export const threadSchema = z.looseObject({
	id: z.string(),
	cwd: z.string().optional(),
	cliVersion: z.string().optional(),
	name: z.string().nullish(),
});

export const threadStartResponseSchema = z.looseObject({
	thread: threadSchema,
	model: z.string().optional(),
	cwd: z.string().optional(),
});
export type CodexThreadStartResponse = z.infer<
	typeof threadStartResponseSchema
>;

export const turnStatusSchema = z.enum([
	"completed",
	"interrupted",
	"failed",
	"inProgress",
]);
export type CodexTurnStatus = z.infer<typeof turnStatusSchema>;

export const turnSchema = z.looseObject({
	id: z.string(),
	status: turnStatusSchema,
	error: z
		.looseObject({
			message: z.string(),
			additionalDetails: z.string().nullish(),
		})
		.nullish(),
	startedAt: z.number().nullish(),
	completedAt: z.number().nullish(),
});
export type CodexTurn = z.infer<typeof turnSchema>;

export const knownCommandActionSchema = z.discriminatedUnion("type", [
	z.looseObject({
		type: z.literal("read"),
		command: z.string(),
		name: z.string(),
		path: z.string(),
	}),
	z.looseObject({
		type: z.literal("listFiles"),
		command: z.string(),
		path: z.string().nullish(),
	}),
	z.looseObject({
		type: z.literal("search"),
		command: z.string(),
		query: z.string().nullish(),
		path: z.string().nullish(),
	}),
]);
export type CodexKnownCommandAction = z.infer<typeof knownCommandActionSchema>;

export const commandActionSchema = z.union([
	knownCommandActionSchema,
	z.looseObject({ type: z.string(), command: z.string().optional() }),
]);
export type CodexCommandAction = z.infer<typeof commandActionSchema>;

export function asKnownCommandAction(
	action: CodexCommandAction,
): CodexKnownCommandAction | null {
	const parsed = knownCommandActionSchema.safeParse(action);
	return parsed.success ? parsed.data : null;
}

export const patchChangeKindSchema = z.looseObject({
	type: z.string(),
	move_path: z.string().nullish(),
});

export const fileUpdateChangeSchema = z.looseObject({
	path: z.string(),
	kind: patchChangeKindSchema,
	diff: z.string(),
});
export type CodexFileUpdateChange = z.infer<typeof fileUpdateChangeSchema>;

const itemStatusSchema = z.enum([
	"inProgress",
	"completed",
	"failed",
	"declined",
]);

export const knownThreadItemSchema = z.discriminatedUnion("type", [
	z.looseObject({ type: z.literal("userMessage"), id: z.string() }),
	z.looseObject({
		type: z.literal("agentMessage"),
		id: z.string(),
		text: z.string(),
	}),
	z.looseObject({ type: z.literal("plan"), id: z.string(), text: z.string() }),
	z.looseObject({
		type: z.literal("reasoning"),
		id: z.string(),
		summary: z.array(z.string()),
		content: z.array(z.string()),
	}),
	z.looseObject({
		type: z.literal("commandExecution"),
		id: z.string(),
		command: z.string(),
		cwd: z.string().nullish(),
		status: itemStatusSchema,
		commandActions: z.array(commandActionSchema).nullish(),
		aggregatedOutput: z.string().nullish(),
		exitCode: z.number().nullish(),
		durationMs: z.number().nullish(),
	}),
	z.looseObject({
		type: z.literal("fileChange"),
		id: z.string(),
		changes: z.array(fileUpdateChangeSchema),
		status: itemStatusSchema,
	}),
	z.looseObject({
		type: z.literal("mcpToolCall"),
		id: z.string(),
		server: z.string(),
		tool: z.string(),
		status: z.enum(["inProgress", "completed", "failed"]),
		arguments: z.unknown().optional(),
		result: z.unknown().optional(),
		error: z.looseObject({ message: z.string() }).nullish(),
	}),
	z.looseObject({
		type: z.literal("dynamicToolCall"),
		id: z.string(),
		tool: z.string(),
		namespace: z.string().nullish(),
		status: z.enum(["inProgress", "completed", "failed"]),
		arguments: z.unknown().optional(),
		contentItems: z
			.array(z.looseObject({ type: z.string(), text: z.string().optional() }))
			.nullish(),
	}),
	z.looseObject({
		type: z.literal("webSearch"),
		id: z.string(),
		query: z.string(),
	}),
	z.looseObject({
		type: z.literal("imageView"),
		id: z.string(),
		path: z.string(),
	}),
	z.looseObject({
		type: z.literal("sleep"),
		id: z.string(),
		durationMs: z.number(),
	}),
	z.looseObject({ type: z.literal("contextCompaction"), id: z.string() }),
	z.looseObject({
		type: z.literal("enteredReviewMode"),
		id: z.string(),
		review: z.string(),
	}),
	z.looseObject({
		type: z.literal("exitedReviewMode"),
		id: z.string(),
		review: z.string(),
	}),
	z.looseObject({
		type: z.literal("subAgentActivity"),
		id: z.string(),
		kind: z.string(),
		agentPath: z.string().optional(),
	}),
]);
export type CodexKnownThreadItem = z.infer<typeof knownThreadItemSchema>;

export const threadItemSchema = z.union([
	knownThreadItemSchema,
	z.looseObject({ type: z.string(), id: z.string() }),
]);
export type CodexThreadItem = z.infer<typeof threadItemSchema>;

export function asKnownThreadItem(
	item: CodexThreadItem,
): CodexKnownThreadItem | null {
	const parsed = knownThreadItemSchema.safeParse(item);
	return parsed.success ? parsed.data : null;
}

export const itemLifecycleSchema = z.looseObject({
	item: threadItemSchema,
	threadId: z.string(),
	turnId: z.string(),
	startedAtMs: z.number().optional(),
	completedAtMs: z.number().optional(),
});
export type CodexItemLifecycle = z.infer<typeof itemLifecycleSchema>;

export const itemDeltaSchema = z.looseObject({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	delta: z.string(),
});

export const turnLifecycleSchema = z.looseObject({
	threadId: z.string(),
	turn: turnSchema,
});

export const planUpdatedSchema = z.looseObject({
	threadId: z.string(),
	turnId: z.string(),
	explanation: z.string().nullish(),
	plan: z.array(
		z.looseObject({
			step: z.string(),
			status: z.enum(["pending", "inProgress", "completed"]),
		}),
	),
});

const tokenUsageBreakdownSchema = z.looseObject({
	totalTokens: z.number(),
	inputTokens: z.number(),
	cachedInputTokens: z.number(),
	outputTokens: z.number(),
});

export const tokenUsageUpdatedSchema = z.looseObject({
	threadId: z.string(),
	turnId: z.string(),
	tokenUsage: z.looseObject({
		total: tokenUsageBreakdownSchema,
		last: tokenUsageBreakdownSchema,
		modelContextWindow: z.number().nullish(),
	}),
});

export const threadStatusChangedSchema = z.looseObject({
	threadId: z.string(),
	status: z.looseObject({ type: z.string() }),
});

export const errorNotificationSchema = z.looseObject({
	error: z.looseObject({ message: z.string() }),
	willRetry: z.boolean().optional(),
	threadId: z.string().optional(),
	turnId: z.string().optional(),
});

export const warningNotificationSchema = z.looseObject({
	message: z.string(),
	threadId: z.string().nullish(),
});

export const commandApprovalParamsSchema = z.looseObject({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	approvalId: z.string().nullish(),
	startedAtMs: z.number().optional(),
	reason: z.string().nullish(),
	command: z.string().nullish(),
	cwd: z.string().nullish(),
	commandActions: z.array(commandActionSchema).nullish(),
});
export type CodexCommandApprovalParams = z.infer<
	typeof commandApprovalParamsSchema
>;

export const fileChangeApprovalParamsSchema = z.looseObject({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	startedAtMs: z.number().optional(),
	reason: z.string().nullish(),
	grantRoot: z.string().nullish(),
});
export type CodexFileChangeApprovalParams = z.infer<
	typeof fileChangeApprovalParamsSchema
>;

export const serverRequestResolvedSchema = z.looseObject({
	threadId: z.string(),
	requestId: requestIdSchema,
});
