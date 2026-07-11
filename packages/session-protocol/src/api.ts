import { z } from "zod";
import type { ContentBlock, RequestPermissionOutcome } from "./acp";
import type { SessionUpdateEnvelope } from "./envelope";
import type { SessionScopedState } from "./state";

// ---------------------------------------------------------------------------
// Cursor encoding for getMessages (journal walked backwards from newest).
// A cursor names the seq BEFORE which the next (older) page starts.
// ---------------------------------------------------------------------------

const CURSOR_PATTERN = /^s([1-9][0-9]*)$/;

export function encodeMessagesCursor(beforeSeq: number): string {
	if (!Number.isInteger(beforeSeq) || beforeSeq < 1) {
		throw new Error(`invalid cursor seq: ${beforeSeq}`);
	}
	return `s${beforeSeq}`;
}

export function decodeMessagesCursor(cursor: string): number | null {
	const match = CURSOR_PATTERN.exec(cursor);
	if (!match) return null;
	const seq = Number(match[1]);
	return Number.isSafeInteger(seq) ? seq : null;
}

// ---------------------------------------------------------------------------
// Router input schemas. ACP payloads cross as typed passthrough (D14-b):
// they were already schema-validated by the sdk at the stdio boundary, so we
// check structure lightly and keep the static type authoritative.
// ---------------------------------------------------------------------------

const sessionIdSchema = z.string().min(1);

const limitSchema = z.number().int().min(1).max(200).default(50);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export const contentBlockSchema = z.custom<ContentBlock>(
	(value) => isRecord(value) && typeof value.type === "string",
	"expected an ACP ContentBlock",
);

export const permissionOutcomeSchema = z.custom<RequestPermissionOutcome>(
	(value) =>
		isRecord(value) &&
		(value.outcome === "cancelled" ||
			(value.outcome === "selected" && typeof value.optionId === "string")),
	"expected an ACP RequestPermissionOutcome",
);

export const listSessionsInput = z.object({
	workspaceId: z.string().min(1).optional(),
	// `<createdAt>:<sessionId>` — the previous page's last row (a sort
	// position; see AcpSessionManager.list). Rejecting malformed cursors here
	// keeps list consistent with getMessages (BAD_REQUEST, not an empty page).
	cursor: z
		.string()
		.regex(/^\d+:.+$/, "expected a <createdAt>:<sessionId> list cursor")
		.refine((cursor) => {
			const separator = cursor.indexOf(":");
			return Number.isSafeInteger(Number(cursor.slice(0, separator)));
		}, "expected a safe-integer createdAt in the list cursor")
		.optional(),
	limit: limitSchema,
});

export const createSessionInput = z.object({
	sessionId: sessionIdSchema,
	workspaceId: z.string().min(1),
});

export const getSessionInput = z.object({
	sessionId: sessionIdSchema,
});

export const getMessagesInput = z.object({
	sessionId: sessionIdSchema,
	cursor: z.string().optional(),
	limit: limitSchema,
});

export const promptInput = z.object({
	sessionId: sessionIdSchema,
	prompt: z.array(contentBlockSchema).min(1),
});

export const respondToPermissionInput = z.object({
	sessionId: sessionIdSchema,
	requestId: z.string().min(1),
	outcome: permissionOutcomeSchema,
});

export const cancelInput = z.object({
	sessionId: sessionIdSchema,
});

export const setModeInput = z.object({
	sessionId: sessionIdSchema,
	modeId: z.string().min(1),
});

export const setConfigOptionInput = z.object({
	sessionId: sessionIdSchema,
	configId: z.string().min(1),
	value: z.union([z.string(), z.boolean()]),
});

// ---------------------------------------------------------------------------
// The client-side contract the React hooks consume. Structural on purpose:
// any transport that can answer these (a tRPC client, a test stub) fits.
// ---------------------------------------------------------------------------

export type RespondToPermissionResult =
	| { status: "resolved" }
	| { status: "already_resolved" };

/**
 * prompt acks admission, not completion: a turn can run for minutes-to-hours
 * (it blocks on human permission decisions), far beyond what a buffered
 * relay HTTP request survives. Turn completion — stop reason, errors — is
 * observed on the update stream's `state` frames.
 */
export interface PromptAccepted {
	accepted: true;
}

export interface MessagesPage {
	items: SessionUpdateEnvelope[];
	nextCursor: string | null;
}

/**
 * `enabled` doubles as the capability signal: `list` is the one ungated ACP
 * procedure, so a host with the feature off answers `{ items: [], enabled:
 * false }` instead of erroring. Clients already call `list` to render the
 * sessions screen, so feature detection costs zero extra requests.
 */
export interface SessionsPage {
	items: SessionScopedState[];
	nextCursor: string | null;
	enabled: boolean;
}

export interface AcpSessionsApi {
	get(input: { sessionId: string }): Promise<SessionScopedState>;
	getMessages(input: {
		sessionId: string;
		cursor?: string;
		limit?: number;
	}): Promise<MessagesPage>;
	prompt(input: {
		sessionId: string;
		prompt: ContentBlock[];
	}): Promise<PromptAccepted>;
	respondToPermission(input: {
		sessionId: string;
		requestId: string;
		outcome: RequestPermissionOutcome;
	}): Promise<RespondToPermissionResult>;
	cancel(input: { sessionId: string }): Promise<void>;
	setMode(input: { sessionId: string; modeId: string }): Promise<void>;
	setConfigOption(input: {
		sessionId: string;
		configId: string;
		value: string | boolean;
	}): Promise<void>;
}
