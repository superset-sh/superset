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
	label: z.string().optional(),
});
export type TextElement = z.infer<typeof textElementSchema>;

export const userContentSchema = z.discriminatedUnion("type", [
	z.looseObject({
		type: z.literal("text"),
		text: z.string(),
		elements: z.array(textElementSchema).optional(),
		/** Reaches the agent, but is not kept on the transcript's user message. */
		hidden: z.boolean().optional(),
	}),
	z.looseObject({
		type: z.literal("attachment"),
		attachmentId: z.string().min(1),
		/** The storage object behind a cloud workspace's attachment; set, it is the identity. */
		fileId: z.string().uuid().optional(),
		name: z.string(),
		mimeType: z.string(),
		sizeBytes: z.number().int().nonnegative().optional(),
	}),
]);
export type UserContent = z.infer<typeof userContentSchema>;

const HIDDEN_TEXT_TAG = "superset-context";

/** How a hidden part reaches the agent, so a replay of its history can drop it again. */
export function wrapHiddenText(text: string): string {
	return `<${HIDDEN_TEXT_TAG}>${text}</${HIDDEN_TEXT_TAG}>`;
}

export function isHiddenText(text: string): boolean {
	const trimmed = text.trim();
	return (
		trimmed.startsWith(`<${HIDDEN_TEXT_TAG}>`) &&
		trimmed.endsWith(`</${HIDDEN_TEXT_TAG}>`)
	);
}

/** `path` is relative to the worktree. An item never carries image bytes. */
export const imageAttachmentSchema = z.looseObject({
	type: z.literal("image"),
	path: z.string().min(1),
	mimeType: z.string(),
	alt: z.string().optional(),
	width: z.number().int().positive().optional(),
	height: z.number().int().positive().optional(),
});
export type ImageAttachment = z.infer<typeof imageAttachmentSchema>;

export const unknownAttachmentSchema = z.looseObject({
	type: z.string().min(1),
});
export type UnknownAttachment = z.infer<typeof unknownAttachmentSchema>;

export const itemAttachmentSchema = z.union([
	imageAttachmentSchema,
	unknownAttachmentSchema,
]);
export type ItemAttachment = ImageAttachment | UnknownAttachment;

export function isImageAttachment(
	attachment: ItemAttachment,
): attachment is ImageAttachment {
	return imageAttachmentSchema.safeParse(attachment).success;
}

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
	z.looseObject({
		type: z.literal("form"),
		values: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
	}),
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
	from: z.literal("parent").optional().catch(undefined),
	clientId: z.string().min(1).optional(),
	queued: z.boolean().optional(),
	discarded: z.boolean().optional(),
	content: z.array(userContentSchema),
});
export type UserMessage = z.infer<typeof userMessageSchema>;

export const agentMessageSchema = z.looseObject({
	...itemBaseFields,
	kind: z.literal("agent_message"),
	text: z.string(),
	/** The agent's own id for this message, where it gives one. */
	agentMessageId: z.string().optional(),
	attachments: z.array(itemAttachmentSchema).optional(),
	model: z.string().optional(),
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

export const subagentStatusSchema = z.enum([
	"running",
	"idle",
	"stopped",
	"failed",
]);
export type SubagentStatus = z.infer<typeof subagentStatusSchema>;

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
	subagent: z.boolean().optional(),
	subagentStatus: subagentStatusSchema.optional().catch(undefined),
	canSteer: z.boolean().optional(),
	canStop: z.boolean().optional(),
	canBackground: z.boolean().optional(),
	attachments: z.array(itemAttachmentSchema).optional(),
	bodyOmitted: z.boolean().optional(),
	mcpServer: z
		.looseObject({
			name: z.string(),
			tool: z.string(),
			source: z.string().optional(),
		})
		.optional(),
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

export const formFieldSchema = z.looseObject({
	id: z.string().min(1),
	title: z.string().optional(),
	description: z.string().optional(),
	input: z.enum(["single", "multi", "text", "number", "integer", "boolean"]),
	required: z.boolean().optional(),
	options: z
		.array(
			z.looseObject({
				value: z.string(),
				label: z.string(),
				description: z.string().optional(),
			}),
		)
		.optional(),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const approvalRequestSchema = z.looseObject({
	...itemBaseFields,
	kind: z.literal("approval_request"),
	targetItemId: z.string().min(1).nullable(),
	title: z.string(),
	detail: z.array(toolContentSchema).optional(),
	options: z
		.array(
			z.looseObject({
				optionId: z.string().min(1),
				label: z.string(),
				kind: z
					.enum(["allow_once", "allow_always", "reject_once", "reject_always"])
					.optional(),
			}),
		)
		.optional(),
	form: z
		.looseObject({ message: z.string(), fields: z.array(formFieldSchema) })
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
