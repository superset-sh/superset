import { z } from "zod";
import {
	SESSION_PERMISSION_MODES,
	type SessionPermissionUpdate,
} from "./permission-contract";
import { permissionUpdateSchema } from "./validation";

export {
	SESSION_PERMISSION_MODES,
	type SessionPermissionMode,
	type SessionPermissionResult,
	type SessionPermissionUpdate,
} from "./permission-contract";

export const SESSION_STATUSES = [
	"starting",
	"idle",
	"running",
	"requires_action",
	"exited",
	"errored",
] as const;

/** @deprecated Prefer SESSION_PERMISSION_MODES. */
export const PERMISSION_MODES = SESSION_PERMISSION_MODES;

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

export const pendingPermissionRequestSchema = z.object({
	requestId: z.string().min(1),
	toolUseID: z.string().min(1),
	toolName: z.string().min(1),
	input: z.record(z.string(), z.unknown()),
	title: z.string().optional(),
	displayName: z.string().optional(),
	description: z.string().optional(),
	suggestions: z
		.array(permissionUpdateSchema as z.ZodType<SessionPermissionUpdate>)
		.optional(),
	blockedPath: z.string().optional(),
	decisionReason: z.string().optional(),
	agentID: z.string().optional(),
	requestedAt: z.number().finite().nonnegative(),
});

export type PendingPermissionRequest = z.infer<
	typeof pendingPermissionRequestSchema
>;

export const pendingUserDialogRequestSchema = z.object({
	/** Superset resolution key; the SDK callback does not provide one. */
	requestId: z.string().min(1),
	dialogKind: z.string().min(1),
	payload: z.record(z.string(), z.unknown()),
	toolUseID: z.string().min(1).optional(),
	requestedAt: z.number().finite().nonnegative(),
});

export type PendingUserDialogRequest = z.infer<
	typeof pendingUserDialogRequestSchema
>;

export const pendingElicitationRequestSchema = z.object({
	/** Superset resolution key; the SDK callback does not provide one. */
	requestId: z.string().min(1),
	serverName: z.string().min(1),
	message: z.string(),
	mode: z.enum(["form", "url"]).optional(),
	url: z.string().optional(),
	elicitationId: z.string().optional(),
	requestedSchema: z.record(z.string(), z.unknown()).optional(),
	title: z.string().optional(),
	displayName: z.string().optional(),
	description: z.string().optional(),
	requestedAt: z.number().finite().nonnegative(),
});

export type PendingElicitationRequest = z.infer<
	typeof pendingElicitationRequestSchema
>;

export const sessionScopedStateSchema = z.object({
	sessionId: z.uuid(),
	claudeSessionId: z.uuid().nullable(),
	workspaceId: z.uuid(),
	harness: z.literal("claude"),
	status: z.enum(SESSION_STATUSES),
	model: z.string().min(1).nullable(),
	permissionMode: z.enum(SESSION_PERMISSION_MODES),
	effort: z.enum(EFFORT_LEVELS).nullable(),
	pendingPermissions: z.array(pendingPermissionRequestSchema),
	pendingUserDialogs: z.array(pendingUserDialogRequestSchema),
	pendingElicitations: z.array(pendingElicitationRequestSchema),
	cwd: z.string(),
	lastSeq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
	lastError: z.string().nullable(),
	createdAt: z.number().finite().nonnegative(),
	updatedAt: z.number().finite().nonnegative(),
});

export type HarnessKind = "claude";
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type SessionScopedState = z.infer<typeof sessionScopedStateSchema>;
