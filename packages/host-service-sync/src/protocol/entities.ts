import { z } from "zod";
import {
	clientInstanceIdSchema,
	eventIdSchema,
	jsonValueSchema,
	messageIdSchema,
	permissionIdSchema,
	sessionErrorSchema,
	sessionIdSchema,
	threadIdSchema,
	timestampSchema,
	toolCallIdSchema,
	turnIdSchema,
	workspaceIdSchema,
} from "./primitives";

const shortTextSchema = z.string().max(4_096);
const identifierSchema = z.string().min(1).max(256);

export const contentBlockSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("text"),
		text: z.string().max(16 * 1024 * 1024),
	}),
	// Assistant reasoning. Modeled as content (not a message role) so thought
	// and prose interleave in one message the way harnesses stream them.
	z.object({
		type: z.literal("thought"),
		text: z.string().max(16 * 1024 * 1024),
	}),
	z.object({
		type: z.literal("image"),
		mimeType: z.string().min(1).max(256),
		data: z.string().max(16 * 1024 * 1024),
	}),
	z.object({
		type: z.literal("resource"),
		uri: z.string().min(1).max(16_384),
		name: z.string().max(1_024).nullable(),
		mimeType: z.string().max(256).nullable(),
	}),
]);

export type ContentBlock = z.infer<typeof contentBlockSchema>;

export const sessionRunStateSchema = z.enum([
	"starting",
	"idle",
	"running",
	"cancelling",
	"offline",
	"failed",
	"closed",
]);

export const threadRunStateSchema = z.enum([
	"idle",
	"running",
	"completed",
	"cancelled",
	"failed",
]);

export const sessionSettingsSchema = z.object({
	activeModel: identifierSchema.nullable(),
	activeMode: identifierSchema.nullable(),
	effort: identifierSchema.nullable(),
	configuration: z.record(identifierSchema, jsonValueSchema),
});

export const sessionCapabilitiesSchema = z.object({
	threadModel: z.enum(["single", "nested"]),
	threadFidelity: z.enum(["full", "partial", "flattened"]),
	canResume: z.boolean(),
	supportsPermissions: z.boolean(),
	supportsModes: z.boolean(),
	supportsModels: z.boolean(),
});

export const sessionSchema = z.object({
	id: sessionIdSchema,
	workspaceId: workspaceIdSchema,
	title: shortTextSchema.nullable(),
	mainThreadId: threadIdSchema,
	agent: z.object({
		id: identifierSchema,
		displayName: z.string().min(1).max(1_024),
	}),
	runState: sessionRunStateSchema,
	capabilities: sessionCapabilitiesSchema,
	settings: sessionSettingsSchema,
	eventHead: z.string().min(1).max(4_096).nullable(),
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
	lastActivityAt: timestampSchema,
	archivedAt: timestampSchema.nullable(),
	closedAt: timestampSchema.nullable(),
	error: sessionErrorSchema.nullable(),
});

export const threadOriginSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("sessionCreated") }),
	z.object({
		type: z.literal("subagent"),
		spawnedByEventId: eventIdSchema,
		spawnedByToolCallId: toolCallIdSchema,
	}),
	z.object({
		type: z.literal("harness"),
		name: identifierSchema,
		spawnedByEventId: eventIdSchema.nullable(),
	}),
]);

export const threadSchema = z
	.object({
		id: threadIdSchema,
		sessionId: sessionIdSchema,
		kind: z.enum(["main", "subagent", "harness"]),
		parentThreadId: threadIdSchema.nullable(),
		origin: threadOriginSchema,
		fidelity: z.enum(["full", "partial"]),
		title: shortTextSchema.nullable(),
		runState: threadRunStateSchema,
		eventHead: z.string().min(1).max(4_096).nullable(),
		createdAt: timestampSchema,
		updatedAt: timestampSchema,
		lastActivityAt: timestampSchema,
	})
	.superRefine((thread, context) => {
		const expectedOrigin =
			thread.kind === "main" ? "sessionCreated" : thread.kind;
		if (thread.origin.type !== expectedOrigin) {
			context.addIssue({
				code: "custom",
				path: ["origin", "type"],
				message: `thread kind ${thread.kind} requires ${expectedOrigin} origin`,
			});
		}
		if (thread.kind === "main" && thread.parentThreadId !== null) {
			context.addIssue({
				code: "custom",
				path: ["parentThreadId"],
				message: "main thread cannot have a parent",
			});
		}
		if (thread.kind !== "main" && thread.parentThreadId === null) {
			context.addIssue({
				code: "custom",
				path: ["parentThreadId"],
				message: `${thread.kind} thread requires a parent`,
			});
		}
	});

export const stopReasonSchema = z.enum([
	"endTurn",
	"cancelled",
	"maxTokens",
	"refusal",
	"error",
	"other",
]);

export const turnSchema = z.object({
	id: turnIdSchema,
	sessionId: sessionIdSchema,
	threadId: threadIdSchema,
	status: z.enum(["accepted", "running", "completed", "cancelled", "failed"]),
	originatingClientInstanceId: clientInstanceIdSchema.nullable(),
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
});

export const messageSchema = z.object({
	id: messageIdSchema,
	sessionId: sessionIdSchema,
	threadId: threadIdSchema,
	turnId: turnIdSchema,
	role: z.enum(["user", "assistant", "system"]),
	content: z.array(contentBlockSchema).max(10_000),
	createdAt: timestampSchema,
});

export const toolResolverSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("host") }),
	z.object({
		type: z.literal("client"),
		capability: identifierSchema,
		routing: z.enum(["originatingClient", "anyCapableClient"]),
	}),
	z.object({
		type: z.literal("external"),
		provider: identifierSchema,
		resolverId: identifierSchema,
	}),
]);

export const toolCallStateSchema = z.enum([
	"requested",
	"awaitingPermission",
	"available",
	"running",
	"succeeded",
	"failed",
	"cancelled",
]);

export const toolCallSchema = z.object({
	id: toolCallIdSchema,
	sessionId: sessionIdSchema,
	threadId: threadIdSchema,
	turnId: turnIdSchema,
	parentToolCallId: toolCallIdSchema.nullable(),
	tool: z.object({
		name: identifierSchema,
		version: z.number().int().safe().positive(),
	}),
	title: shortTextSchema,
	input: jsonValueSchema,
	resolver: toolResolverSchema,
	state: toolCallStateSchema,
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
	expiresAt: timestampSchema.nullable(),
});

export const toolCallUpdateSchema = z.object({
	title: shortTextSchema.optional(),
	input: jsonValueSchema.optional(),
	output: jsonValueSchema.optional(),
	state: toolCallStateSchema.optional(),
	updatedAt: timestampSchema,
});

export const permissionOptionSchema = z.object({
	id: identifierSchema,
	name: z.string().min(1).max(1_024),
	kind: z.enum([
		"allowOnce",
		"allowAlways",
		"rejectOnce",
		"rejectAlways",
		"other",
	]),
});

export const permissionRequestSchema = z.object({
	id: permissionIdSchema,
	sessionId: sessionIdSchema,
	threadId: threadIdSchema,
	toolCallId: toolCallIdSchema,
	options: z.array(permissionOptionSchema).min(1).max(100),
	multiSelect: z.boolean(),
	requestedAt: timestampSchema,
});

export const permissionOutcomeSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("selected"),
		optionIds: z.array(identifierSchema).min(1).max(100),
	}),
	z.object({ type: z.literal("cancelled") }),
]);

export const planEntrySchema = z.object({
	id: identifierSchema,
	content: z.string().max(64 * 1024),
	status: z.enum(["pending", "inProgress", "completed"]),
	priority: z.enum(["low", "medium", "high"]).nullable(),
});

export const toolCallOutcomeSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("succeeded"),
		output: jsonValueSchema,
	}),
	z.object({
		type: z.literal("failed"),
		error: z.object({
			code: identifierSchema,
			message: shortTextSchema,
			retryable: z.boolean(),
		}),
	}),
	z.object({
		type: z.literal("cancelled"),
		reason: shortTextSchema.nullable(),
	}),
]);

export type SessionRunState = z.infer<typeof sessionRunStateSchema>;
export type ThreadRunState = z.infer<typeof threadRunStateSchema>;
export type SessionSettings = z.infer<typeof sessionSettingsSchema>;
export type SessionCapabilities = z.infer<typeof sessionCapabilitiesSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type ThreadOrigin = z.infer<typeof threadOriginSchema>;
export type Thread = z.infer<typeof threadSchema>;
export type StopReason = z.infer<typeof stopReasonSchema>;
export type Turn = z.infer<typeof turnSchema>;
export type Message = z.infer<typeof messageSchema>;
export type ToolResolver = z.infer<typeof toolResolverSchema>;
export type ToolCallState = z.infer<typeof toolCallStateSchema>;
export type ToolCall = z.infer<typeof toolCallSchema>;
export type ToolCallUpdate = z.infer<typeof toolCallUpdateSchema>;
export type PermissionOption = z.infer<typeof permissionOptionSchema>;
export type PermissionRequest = z.infer<typeof permissionRequestSchema>;
export type PermissionOutcome = z.infer<typeof permissionOutcomeSchema>;
export type PlanEntry = z.infer<typeof planEntrySchema>;
export type ToolCallOutcome = z.infer<typeof toolCallOutcomeSchema>;
