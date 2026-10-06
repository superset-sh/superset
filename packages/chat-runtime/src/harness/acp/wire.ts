import { z } from "zod";

/**
 * Minimal zod views over the Agent Client Protocol (agent-client-protocol
 * v2.x) messages the chat runtime consumes. Loose objects everywhere so the
 * adapter tolerates fields newer agents add.
 */

export const acpTextContentSchema = z.looseObject({
	type: z.literal("text"),
	text: z.string(),
});

export const acpContentBlockSchema = z.looseObject({
	type: z.string(),
	text: z.string().optional(),
});
export type AcpContentBlock = z.infer<typeof acpContentBlockSchema>;

/**
 * The agent answers with the version we asked for when it supports it, and
 * otherwise with the newest it does — so the reply, not the request, says what
 * is being spoken. v2 renamed `agentCapabilities` to `capabilities`; both are
 * read so one adapter works either side of the bump.
 */
export const acpInitializeResponseSchema = z.looseObject({
	protocolVersion: z.number().optional(),
	agentCapabilities: z.looseObject({}).optional(),
	capabilities: z.looseObject({}).optional(),
	authMethods: z.array(z.unknown()).optional(),
});
export type AcpInitializeResponse = z.infer<typeof acpInitializeResponseSchema>;

export const acpNewSessionResponseSchema = z.looseObject({
	sessionId: z.string().min(1),
	modes: z
		.looseObject({
			currentModeId: z.string().optional(),
			availableModes: z
				.array(z.looseObject({ id: z.string(), name: z.string() }))
				.optional(),
		})
		.optional(),
});

export const acpPromptResponseSchema = z.looseObject({
	stopReason: z.string(),
});

// --- session/update variants -------------------------------------------------

const acpToolCallContentSchema = z.looseObject({
	type: z.string(),
	content: acpContentBlockSchema.optional(),
	path: z.string().optional(),
	oldText: z.string().nullable().optional(),
	newText: z.string().optional(),
	terminalId: z.string().optional(),
	// v2 replaced the single-file diff fields above with structured changes plus
	// renderable patch text.
	changes: z
		.array(
			z.looseObject({
				path: z.string(),
				operation: z.string().nullable().optional(),
			}),
		)
		.nullable()
		.optional(),
	patch: z
		.looseObject({ format: z.string().optional(), text: z.string() })
		.nullable()
		.optional(),
});
export type AcpToolCallContent = z.infer<typeof acpToolCallContentSchema>;

const acpLocationSchema = z.looseObject({
	path: z.string(),
	line: z.number().int().optional(),
});

/**
 * v2 gave every patchable field null as a third state — omitted leaves the
 * stored value alone, null clears it — so each one has to parse as nullable or
 * the whole update is rejected and the tool call never reaches the transcript.
 */
export const acpToolCallUpdateSchema = z.looseObject({
	toolCallId: z.string().min(1),
	name: z.string().nullable().optional(),
	title: z.string().nullable().optional(),
	kind: z.string().nullable().optional(),
	status: z.string().nullable().optional(),
	content: z.array(acpToolCallContentSchema).nullable().optional(),
	locations: z.array(acpLocationSchema).nullable().optional(),
	rawInput: z.unknown().optional(),
	rawOutput: z.unknown().optional(),
});
export type AcpToolCallUpdate = z.infer<typeof acpToolCallUpdateSchema>;

/** v2 `tool_call_content_chunk`: one content item appended to a tool call. */
export const acpToolCallContentChunkSchema = z.looseObject({
	toolCallId: z.string().min(1),
	content: acpToolCallContentSchema,
});

export const acpAvailableCommandsUpdateSchema = z.looseObject({
	availableCommands: z.array(
		z.looseObject({
			name: z.string(),
			description: z.string().optional(),
			input: z
				.looseObject({ hint: z.string().optional() })
				.nullable()
				.optional(),
		}),
	),
});

export const acpPlanSchema = z.looseObject({
	entries: z.array(
		z.looseObject({
			content: z.string(),
			priority: z.string().optional(),
			status: z.string(),
		}),
	),
});

export const acpPlanEntriesSchema = z.array(
	z.looseObject({
		content: z.string(),
		priority: z.string().optional(),
		status: z.string(),
	}),
);

/**
 * v2 `plan_update`, also present in v1 1.5.x as an unstable variant and
 * identical in both. Entries are a whole replacement for the named plan; the
 * `file` and `markdown` plan bodies have no entries and are not rendered.
 */
export const acpPlanUpdateSchema = z.looseObject({
	plan: z.looseObject({
		type: z.string(),
		planId: z.string().min(1),
		entries: acpPlanEntriesSchema.optional(),
	}),
});

/**
 * v2 `state_update`: a snapshot of the agent's foreground work, not a mode.
 * `idle` carries the stop reason that ended it.
 */
export const acpStateUpdateSchema = z.looseObject({
	state: z.string(),
	stopReason: z.string().nullable().optional(),
});

/**
 * v2 `subagent_update`: a child session the parent owns. Only `sessionId` is
 * required; the rest patch what was announced before.
 */
export const acpSubagentUpdateSchema = z.looseObject({
	sessionId: z.string().min(1),
	title: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	state: z.looseObject({ state: z.string() }).nullable().optional(),
});
export type AcpSubagentUpdate = z.infer<typeof acpSubagentUpdateSchema>;

export const acpSessionInfoUpdateSchema = z.looseObject({
	title: z.string().nullable().optional(),
});

/** A selectable value, or — when it carries `options` — a group of them. */
const acpConfigSelectOptionSchema = z.looseObject({
	value: z.string().optional(),
	name: z.string(),
	description: z.string().nullable().optional(),
	options: z
		.array(
			z.looseObject({
				value: z.string(),
				name: z.string(),
				description: z.string().nullable().optional(),
			}),
		)
		.optional(),
});
export type AcpConfigSelectOption = z.infer<typeof acpConfigSelectOptionSchema>;

/**
 * `config_option_update` is where v2 keeps the session mode: v2 dropped
 * `current_mode_update` and `session/set_mode` outright, and a mode is now a
 * `select` config option whose category is "mode". Options arrive either flat
 * or grouped under headers.
 */
export const acpConfigOptionUpdateSchema = z.looseObject({
	configOptions: z.array(
		z.looseObject({
			configId: z.string().min(1).optional(),
			id: z.string().min(1).optional(),
			name: z.string(),
			type: z.string().optional(),
			category: z.string().nullable().optional(),
			currentValue: z.unknown().optional(),
			options: z.array(acpConfigSelectOptionSchema).nullable().optional(),
		}),
	),
});

const messageChunkSchema = z.looseObject({
	content: acpContentBlockSchema,
	/** v2 names the message a chunk belongs to; a new id starts a new message. */
	messageId: z.string().min(1).optional(),
});

/**
 * v2 `agent_message` / `user_message` / `agent_thought`: a whole message keyed
 * by `messageId`. Omitted content leaves what was streamed alone, null or []
 * clears it, and an array replaces it.
 */
export const acpMessageSchema = z.looseObject({
	messageId: z.string().min(1),
	content: z.array(acpContentBlockSchema).nullable().optional(),
});

// Only the discriminator is validated here; each variant carries different
// shapes for `content` (object for message chunks, array for tool calls), so
// the per-variant handlers parse their own fields from the raw update.
export const acpSessionUpdateSchema = z.looseObject({
	sessionUpdate: z.string(),
	currentModeId: z.string().optional(),
});

export const acpSessionNotificationSchema = z.looseObject({
	sessionId: z.string().min(1),
	update: z.looseObject({ sessionUpdate: z.string() }),
});

export const acpAgentMessageChunkSchema = messageChunkSchema;
export const acpUserMessageChunkSchema = messageChunkSchema;
export const acpAgentThoughtChunkSchema = messageChunkSchema;

// --- session/request_permission ----------------------------------------------

export const acpPermissionOptionSchema = z.looseObject({
	optionId: z.string().min(1),
	name: z.string(),
	kind: z.string().optional(),
});
export type AcpPermissionOption = z.infer<typeof acpPermissionOptionSchema>;

export const acpRequestPermissionParamsSchema = z.looseObject({
	sessionId: z.string().min(1),
	toolCall: acpToolCallUpdateSchema.partial({ toolCallId: true }).optional(),
	options: z.array(acpPermissionOptionSchema),
});
export type AcpRequestPermissionParams = z.infer<
	typeof acpRequestPermissionParamsSchema
>;
