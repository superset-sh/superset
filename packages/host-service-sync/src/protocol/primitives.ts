import { z } from "zod";

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

const MAX_JSON_STRING_LENGTH = 16 * 1024 * 1024;
const MAX_JSON_COLLECTION_ITEMS = 10_000;
const MAX_JSON_OBJECT_KEYS = 10_000;
const MAX_JSON_DEPTH = 64;

const jsonPrimitiveSchema = z.union([
	z.null(),
	z.boolean(),
	z.number(),
	z.string().max(MAX_JSON_STRING_LENGTH),
]);

function jsonObjectSchema(
	valueSchema: z.ZodType<JsonValue>,
): z.ZodType<Record<string, JsonValue>> {
	return z
		.record(z.string().max(256), valueSchema)
		.superRefine((value, context) => {
			if (Object.keys(value).length > MAX_JSON_OBJECT_KEYS) {
				context.addIssue({
					code: "too_big",
					maximum: MAX_JSON_OBJECT_KEYS,
					origin: "object",
					inclusive: true,
					message: `JSON object exceeds ${MAX_JSON_OBJECT_KEYS} keys`,
				});
			}
		});
}

let boundedJsonValueSchema: z.ZodType<JsonValue> = jsonPrimitiveSchema;
for (let depth = 0; depth < MAX_JSON_DEPTH; depth += 1) {
	const childSchema = boundedJsonValueSchema;
	boundedJsonValueSchema = z.union([
		jsonPrimitiveSchema,
		z.array(childSchema).max(MAX_JSON_COLLECTION_ITEMS),
		jsonObjectSchema(childSchema),
	]);
}

export const jsonValueSchema = boundedJsonValueSchema;

export const protocolVersionSchema = z.literal(1);
export type ProtocolVersion = z.infer<typeof protocolVersionSchema>;

export const requestIdSchema = z.string().min(1).max(512);
export const hostIdSchema = z.string().min(1).max(256);
export const connectionIdSchema = z.string().min(1).max(256);
export const clientInstanceIdSchema = z.string().min(1).max(256);
export const workspaceIdSchema = z.string().min(1).max(256);
export const sessionIdSchema = z.string().min(1).max(256);
export const threadIdSchema = z.string().min(1).max(256);
export const turnIdSchema = z.string().min(1).max(256);
export const eventIdSchema = z.string().min(1).max(256);
export const messageIdSchema = z.string().min(1).max(256);
export const toolCallIdSchema = z.string().min(1).max(256);
export const permissionIdSchema = z.string().min(1).max(256);
export const subscriptionIdSchema = z.string().min(1).max(512);
export const cursorSchema = z.string().min(1).max(4_096);
export const timestampSchema = z.number().int().safe().nonnegative();

export type RequestId = z.infer<typeof requestIdSchema>;
export type HostId = z.infer<typeof hostIdSchema>;
export type ConnectionId = z.infer<typeof connectionIdSchema>;
export type ClientInstanceId = z.infer<typeof clientInstanceIdSchema>;
export type WorkspaceId = z.infer<typeof workspaceIdSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;
export type ThreadId = z.infer<typeof threadIdSchema>;
export type TurnId = z.infer<typeof turnIdSchema>;
export type EventId = z.infer<typeof eventIdSchema>;
export type MessageId = z.infer<typeof messageIdSchema>;
export type ToolCallId = z.infer<typeof toolCallIdSchema>;
export type PermissionId = z.infer<typeof permissionIdSchema>;
export type SubscriptionId = z.infer<typeof subscriptionIdSchema>;
export type Cursor = z.infer<typeof cursorSchema>;

export const sessionErrorCodeSchema = z.enum([
	"SESSION_NOT_FOUND",
	"SESSION_CLOSED",
	"WORKSPACE_NOT_FOUND",
	"NATIVE_SESSION_NOT_FOUND",
	"ADAPTER_UNAVAILABLE",
	"ADAPTER_PROTOCOL_ERROR",
	"AUTH_REQUIRED",
	"UNSUPPORTED_OPERATION",
	"INTERNAL_ERROR",
]);

export const sessionErrorRecoverySchema = z.enum([
	"retry",
	"reauthenticate",
	"startNewSession",
	"archiveSession",
	"none",
]);

export const sessionErrorSchema = z.object({
	code: sessionErrorCodeSchema,
	retryable: z.boolean(),
	recovery: sessionErrorRecoverySchema,
	occurredAt: timestampSchema,
});

export type SessionErrorCode = z.infer<typeof sessionErrorCodeSchema>;
export type SessionErrorRecovery = z.infer<typeof sessionErrorRecoverySchema>;
export type SessionError = z.infer<typeof sessionErrorSchema>;

export const syncErrorCodeSchema = z.enum([
	"INVALID_PACKET",
	"UNSUPPORTED_PROTOCOL_VERSION",
	"UNAUTHORIZED",
	"SUBSCRIPTION_LIMIT",
	"SESSION_NOT_FOUND",
	"CURSOR_INVALID",
	"CURSOR_EXPIRED",
	"HISTORY_REWRITTEN",
	"OVERLOADED",
	"INTERNAL_ERROR",
]);

export type SyncErrorCode = z.infer<typeof syncErrorCodeSchema>;
