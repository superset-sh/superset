import { z } from "zod";
import {
	SESSION_PERMISSION_MODES,
	type SessionPermissionMode,
	type SessionPermissionResult,
} from "./permission-contract";
import type {
	AgentInfo,
	EffortLevel,
	ElicitationResult,
	ModelInfo,
	SDKUserMessage,
	SessionMessage,
	SlashCommand,
	UserDialogResult,
} from "./sdk-types";
import { EFFORT_LEVELS, type SessionScopedState } from "./state";
import {
	elicitationResultSchema,
	permissionResultSchema,
	sdkUserMessageSchema,
	userDialogResultSchema,
} from "./validation";

const MESSAGE_CURSOR_PATTERN = /^m1_([0-9a-z]+)$/;

/**
 * Opaque cursor for the index before which the next, older transcript page
 * ends. Clients must never inspect this value; only the host decodes it.
 */
export function encodeMessagesCursor(beforeOffset: number): string {
	if (
		!Number.isSafeInteger(beforeOffset) ||
		beforeOffset < 0 ||
		beforeOffset > Number.MAX_SAFE_INTEGER
	) {
		throw new Error(`invalid message cursor offset: ${beforeOffset}`);
	}
	return `m1_${beforeOffset.toString(36)}`;
}

export function decodeMessagesCursor(cursor: string): number | null {
	const match = MESSAGE_CURSOR_PATTERN.exec(cursor);
	if (!match?.[1]) return null;
	const offset = Number.parseInt(match[1], 36);
	if (!Number.isSafeInteger(offset) || offset < 0) return null;
	return encodeMessagesCursor(offset) === cursor ? offset : null;
}

const sessionIdSchema = z.uuid();
const workspaceIdSchema = z.uuid();
const limitSchema = z.number().int().min(1).max(200).default(50);

export const listSessionsInput = z.object({
	workspaceId: workspaceIdSchema.optional(),
	cursor: z.string().min(1).optional(),
	limit: limitSchema,
});

export const createSessionInput = z.object({
	sessionId: sessionIdSchema,
	workspaceId: workspaceIdSchema,
	model: z.string().min(1).optional(),
	permissionMode: z.enum(SESSION_PERMISSION_MODES).optional(),
	effort: z.enum(EFFORT_LEVELS).optional(),
	title: z.string().min(1).optional(),
});

export const getSessionInput = z.object({ sessionId: sessionIdSchema });

/**
 * Retry never accepts new configuration. The host reuses the failed
 * Superset session's workspace and controls while starting a fresh Claude
 * transcript attempt.
 */
export const retrySessionInput = z
	.object({ sessionId: sessionIdSchema })
	.strict();

export const getMessagesInput = z.object({
	sessionId: sessionIdSchema,
	cursor: z.string().min(1).optional(),
	limit: limitSchema,
});

export const sendMessageInput = z.object({
	sessionId: sessionIdSchema,
	message: sdkUserMessageSchema,
});

export const respondToPermissionInput = z.object({
	sessionId: sessionIdSchema,
	requestId: z.string().min(1),
	response: permissionResultSchema,
});

export const respondToUserDialogInput = z.object({
	sessionId: sessionIdSchema,
	requestId: z.string().min(1),
	response: userDialogResultSchema,
});

export const respondToElicitationInput = z.object({
	sessionId: sessionIdSchema,
	requestId: z.string().min(1),
	response: elicitationResultSchema,
});

export const interruptInput = getSessionInput;
export const interruptSessionInput = interruptInput;

export const setModelInput = z.object({
	sessionId: sessionIdSchema,
	/** Omit to restore the SDK's default model. */
	model: z.string().min(1).optional(),
});

export const setPermissionModeInput = z.object({
	sessionId: sessionIdSchema,
	permissionMode: z.enum(SESSION_PERMISSION_MODES),
});

export const getCatalogInput = getSessionInput;

export type ListSessionsInput = z.input<typeof listSessionsInput>;
export type CreateSessionInput = z.input<typeof createSessionInput>;
export type GetMessagesInput = z.input<typeof getMessagesInput>;
export type SendMessageInput = z.input<typeof sendMessageInput>;

export interface SendMessageAccepted {
	accepted: true;
}

export type ResolvePendingResult =
	| { status: "resolved" }
	| { status: "already_resolved" };

export interface MessagesPage {
	items: SessionMessage[];
	nextCursor: string | null;
}

export interface SessionsPage {
	items: SessionScopedState[];
	nextCursor: string | null;
}

export interface SessionCatalog {
	models: ModelInfo[];
	commands: SlashCommand[];
	agents: AgentInfo[];
	permissionModes: SessionPermissionMode[];
}

/** Structural client contract; tRPC callers and test doubles both satisfy it. */
export interface SessionsApi {
	create(input: {
		sessionId: string;
		workspaceId: string;
		model?: string;
		permissionMode?: SessionPermissionMode;
		effort?: EffortLevel;
		title?: string;
	}): Promise<SessionScopedState>;
	retry(input: { sessionId: string }): Promise<SessionScopedState>;
	get(input: { sessionId: string }): Promise<SessionScopedState>;
	list(input?: {
		workspaceId?: string;
		cursor?: string;
		limit?: number;
	}): Promise<SessionsPage>;
	getMessages(input: {
		sessionId: string;
		cursor?: string;
		limit?: number;
	}): Promise<MessagesPage>;
	sendMessage(input: {
		sessionId: string;
		message: SDKUserMessage;
	}): Promise<SendMessageAccepted>;
	respondToPermission(input: {
		sessionId: string;
		requestId: string;
		response: SessionPermissionResult;
	}): Promise<ResolvePendingResult>;
	respondToUserDialog(input: {
		sessionId: string;
		requestId: string;
		response: UserDialogResult;
	}): Promise<ResolvePendingResult>;
	respondToElicitation(input: {
		sessionId: string;
		requestId: string;
		response: ElicitationResult;
	}): Promise<ResolvePendingResult>;
	interrupt(input: { sessionId: string }): Promise<void>;
	setModel(input: { sessionId: string; model?: string }): Promise<void>;
	setPermissionMode(input: {
		sessionId: string;
		permissionMode: SessionPermissionMode;
	}): Promise<void>;
	getCatalog(input: { sessionId: string }): Promise<SessionCatalog>;
}
