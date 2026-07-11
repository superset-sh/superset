import { z } from "zod";
import {
	SESSION_PERMISSION_MODES,
	type SessionPermissionResult,
	type SessionPermissionUpdate,
} from "./permission-contract";
import type {
	ElicitationResult,
	SDKMessage,
	SDKUserMessage,
	SessionMessage,
	UserDialogResult,
} from "./sdk-types";

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const permissionBehaviorSchema = z.enum(["allow", "deny", "ask"]);
const permissionDestinationSchema = z.enum([
	"userSettings",
	"projectSettings",
	"localSettings",
	"session",
	"cliArg",
]);
const permissionModeSchema = z.enum(SESSION_PERMISSION_MODES);
const permissionRuleSchema = z.object({
	toolName: z.string().min(1),
	ruleContent: z.string().optional(),
});

export const permissionUpdateSchema: z.ZodType<SessionPermissionUpdate> =
	z.union([
		z.object({
			type: z.enum(["addRules", "replaceRules", "removeRules"]),
			rules: z.array(permissionRuleSchema),
			behavior: permissionBehaviorSchema,
			destination: permissionDestinationSchema,
		}),
		z.object({
			type: z.literal("setMode"),
			mode: permissionModeSchema,
			destination: permissionDestinationSchema,
		}),
		z.object({
			type: z.enum(["addDirectories", "removeDirectories"]),
			directories: z.array(z.string()),
			destination: permissionDestinationSchema,
		}),
	]);

const permissionDecisionClassificationSchema = z.enum([
	"user_temporary",
	"user_permanent",
	"user_reject",
]);

export const permissionResultSchema: z.ZodType<SessionPermissionResult> =
	z.discriminatedUnion("behavior", [
		z.object({
			behavior: z.literal("allow"),
			updatedInput: z.record(z.string(), z.unknown()).optional(),
			updatedPermissions: z.array(permissionUpdateSchema).optional(),
			toolUseID: z.string().min(1).optional(),
			decisionClassification: permissionDecisionClassificationSchema.optional(),
		}),
		z.object({
			behavior: z.literal("deny"),
			message: z.string(),
			interrupt: z.boolean().optional(),
			toolUseID: z.string().min(1).optional(),
			decisionClassification: permissionDecisionClassificationSchema.optional(),
		}),
	]);

export const userDialogResultSchema: z.ZodType<UserDialogResult> =
	z.discriminatedUnion("behavior", [
		z.object({
			behavior: z.literal("completed"),
			result: z.unknown(),
		}),
		z.object({ behavior: z.literal("cancelled") }),
	]);

export const elicitationResultSchema = z.custom<ElicitationResult>((value) => {
	if (
		!isRecord(value) ||
		!["accept", "decline", "cancel"].includes(String(value.action))
	) {
		return false;
	}
	if (value.content === undefined) return true;
	if (!isRecord(value.content)) return false;
	return Object.values(value.content).every(
		(item) =>
			typeof item === "string" ||
			typeof item === "number" ||
			typeof item === "boolean" ||
			(Array.isArray(item) && item.every((entry) => typeof entry === "string")),
	);
}, "expected a Claude SDK elicitation result");

/**
 * The SDK does not export runtime schemas. Validate the stable outer shape and
 * leave message variants verbatim so newer Claude SDK frames remain forward
 * compatible with older clients.
 */
export const sdkMessageSchema = z.custom<SDKMessage>((value) => {
	if (!isRecord(value) || typeof value.type !== "string" || value.type === "") {
		return false;
	}
	switch (value.type) {
		case "assistant":
			return (
				typeof value.uuid === "string" &&
				typeof value.session_id === "string" &&
				isRecord(value.message) &&
				Array.isArray(value.message.content)
			);
		case "user":
			return (
				isRecord(value.message) &&
				value.message.role === "user" &&
				(typeof value.message.content === "string" ||
					Array.isArray(value.message.content))
			);
		case "system":
			return (
				typeof value.subtype === "string" &&
				typeof value.uuid === "string" &&
				typeof value.session_id === "string"
			);
		case "result":
			return (
				typeof value.subtype === "string" &&
				typeof value.uuid === "string" &&
				typeof value.session_id === "string"
			);
		case "stream_event":
			return (
				typeof value.uuid === "string" &&
				typeof value.session_id === "string" &&
				isRecord(value.event) &&
				typeof value.event.type === "string"
			);
		default:
			// Keep forward compatibility for informational SDK variants while
			// protecting the core variants the fold layer dereferences.
			return true;
	}
}, "expected a Claude SDK message");

export const sdkUserMessageSchema = z.custom<SDKUserMessage>((value) => {
	if (!isRecord(value) || value.type !== "user" || !isRecord(value.message)) {
		return false;
	}
	if (value.message.role !== "user") return false;
	const content = value.message.content;
	if (!(typeof content === "string" || Array.isArray(content))) return false;
	return (
		value.parent_tool_use_id === null ||
		typeof value.parent_tool_use_id === "string"
	);
}, "expected a Claude SDK user message");

export const sessionMessageSchema: z.ZodType<SessionMessage> = z.object({
	type: z.enum(["user", "assistant", "system"]),
	uuid: z.string().min(1),
	session_id: z.string().min(1),
	message: z.unknown(),
	parent_tool_use_id: z.string().nullable(),
	parent_agent_id: z.string().nullable(),
});
