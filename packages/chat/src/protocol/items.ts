import { z } from "zod";

const itemBaseFields = {
	id: z.string().min(1),
	parentItemId: z.string().min(1).optional(),
	startedAtMs: z.number(),
	completedAtMs: z.number().optional(),
};

export const textElementSchema = z.looseObject({
	byteRange: z.object({
		start: z.number().int().nonnegative(),
		end: z.number().int().nonnegative(),
	}),
	elementKind: z.enum(["file_mention", "slash_command", "other"]),
});
export type TextElement = z.infer<typeof textElementSchema>;

export const userContentSchema = z.discriminatedUnion("type", [
	z.looseObject({
		type: z.literal("text"),
		text: z.string(),
		elements: z.array(textElementSchema).optional(),
	}),
	z.looseObject({
		type: z.literal("attachment"),
		attachmentId: z.string().min(1),
		name: z.string(),
		mimeType: z.string(),
	}),
]);
export type UserContent = z.infer<typeof userContentSchema>;

export const toolContentSchema = z.discriminatedUnion("type", [
	z.looseObject({ type: z.literal("text"), text: z.string() }),
	z.looseObject({
		type: z.literal("diff"),
		path: z.string(),
		oldText: z.string().nullable(),
		newText: z.string(),
	}),
	z.looseObject({
		type: z.literal("terminal"),
		command: z.string(),
		output: z.string(),
		exitCode: z.number().int().optional(),
		truncated: z.boolean().optional(),
	}),
]);
export type ToolContent = z.infer<typeof toolContentSchema>;

export const decisionSchema = z.discriminatedUnion("type", [
	z.looseObject({ type: z.literal("accept") }),
	z.looseObject({ type: z.literal("accept_for_session") }),
	z.looseObject({ type: z.literal("decline") }),
	z.looseObject({ type: z.literal("cancel") }),
	z.looseObject({ type: z.literal("option"), optionId: z.string().min(1) }),
]);
export type Decision = z.infer<typeof decisionSchema>;

export const toolKindSchema = z.enum([
	"read",
	"edit",
	"delete",
	"move",
	"search",
	"execute",
	"think",
	"fetch",
	"other",
]);
export type ToolKind = z.infer<typeof toolKindSchema>;

export const userMessageSchema = z.looseObject({
	...itemBaseFields,
	kind: z.literal("user_message"),
	clientId: z.string().min(1).optional(),
	queued: z.boolean().optional(),
	content: z.array(userContentSchema),
});
export type UserMessage = z.infer<typeof userMessageSchema>;

export const agentMessageSchema = z.looseObject({
	...itemBaseFields,
	kind: z.literal("agent_message"),
	text: z.string(),
});
export type AgentMessage = z.infer<typeof agentMessageSchema>;

export const reasoningSchema = z.looseObject({
	...itemBaseFields,
	kind: z.literal("reasoning"),
	text: z.string(),
	summary: z.string().optional(),
});
export type Reasoning = z.infer<typeof reasoningSchema>;

export const toolCallStatusSchema = z.enum([
	"running",
	"completed",
	"failed",
	"declined",
	"canceled",
]);
export type ToolCallStatus = z.infer<typeof toolCallStatusSchema>;

export const toolCallSchema = z.looseObject({
	...itemBaseFields,
	kind: z.literal("tool_call"),
	title: z.string(),
	toolKind: toolKindSchema,
	toolName: z.string(),
	status: toolCallStatusSchema,
	content: z.array(toolContentSchema),
	locations: z
		.array(
			z.looseObject({ path: z.string(), line: z.number().int().optional() }),
		)
		.optional(),
	rawInput: z.unknown().optional(),
	rawOutput: z.unknown().optional(),
});
export type ToolCall = z.infer<typeof toolCallSchema>;

export const planSchema = z.looseObject({
	...itemBaseFields,
	kind: z.literal("plan"),
	entries: z.array(
		z.looseObject({
			text: z.string(),
			status: z.enum(["pending", "in_progress", "completed"]),
		}),
	),
});
export type Plan = z.infer<typeof planSchema>;

export const approvalRequestSchema = z.looseObject({
	...itemBaseFields,
	kind: z.literal("approval_request"),
	targetItemId: z.string().min(1).nullable(),
	title: z.string(),
	detail: z.array(toolContentSchema).optional(),
	options: z
		.array(z.looseObject({ optionId: z.string().min(1), label: z.string() }))
		.optional(),
	status: z.enum(["pending", "answered", "stale"]),
	decision: decisionSchema.optional(),
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const noticeSchema = z.looseObject({
	...itemBaseFields,
	kind: z.literal("notice"),
	noticeKind: z.enum(["compaction", "config_change", "error", "info"]),
	text: z.string().optional(),
});
export type Notice = z.infer<typeof noticeSchema>;

export const knownItemSchema = z.discriminatedUnion("kind", [
	userMessageSchema,
	agentMessageSchema,
	reasoningSchema,
	toolCallSchema,
	planSchema,
	approvalRequestSchema,
	noticeSchema,
]);
export type KnownItem = z.infer<typeof knownItemSchema>;

export const unknownItemSchema = z.looseObject({
	...itemBaseFields,
	kind: z.string().min(1),
});
export type UnknownItem = z.infer<typeof unknownItemSchema>;

export const itemSchema = z.union([knownItemSchema, unknownItemSchema]);
export type Item = KnownItem | UnknownItem;

const KNOWN_ITEM_KINDS = new Set<string>([
	"user_message",
	"agent_message",
	"reasoning",
	"tool_call",
	"plan",
	"approval_request",
	"notice",
]);

export function isKnownItem(item: Item): item is KnownItem {
	return KNOWN_ITEM_KINDS.has(item.kind);
}
