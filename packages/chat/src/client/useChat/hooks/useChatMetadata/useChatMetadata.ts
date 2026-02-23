import { useCallback, useMemo } from "react";
import type { AgentValue, ChunkRow, RawPresenceRow } from "../../../../schema";
import type { SessionDB } from "../../../../session-db/session-db";
import { useCollectionData } from "../useCollectionData";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatUserPresence {
	userId: string;
	deviceId: string;
	name?: string;
	status: "active" | "idle" | "typing" | "offline";
	lastSeenAt: string;
	draft?: string;
	cursorPosition?: number;
}

export interface ChatAgentPresence {
	agentId: string;
	name?: string;
	endpoint: string;
	triggers?: "all" | "user-messages";
	model?: string;
	generationMessageId?: string;
}

export interface ChatMcpStatus {
	issues: ChatMcpIssue[];
	serverNames: string[];
	sources: string[];
	errors: string[];
	updatedAt?: string;
}

export interface ChatMcpIssue {
	code: string;
	message: string;
	serverName?: string;
	source?: string;
	authRequired?: boolean;
}

export interface UseChatMetadataOptions {
	sessionDB: SessionDB | null;
	proxyUrl: string;
	sessionId: string | null;
	getHeaders?: () => Record<string, string>;
}

export interface UseChatMetadataReturn {
	/** Current session title (derived from stream config events). */
	title: string | null;
	/** MCP status emitted by the host for the latest run in this session. */
	mcp: ChatMcpStatus | null;
	/** Online users in this session. */
	users: ChatUserPresence[];
	/** Registered agents in this session. */
	agents: ChatAgentPresence[];
	/** Update user presence status. */
	updateStatus: (
		userId: string,
		deviceId: string,
		status: ChatUserPresence["status"],
	) => void;
	/** Update user draft text. */
	updateDraft: (
		userId: string,
		deviceId: string,
		text: string,
		cursorPosition?: number,
	) => void;
	/** Users currently typing with draft content. */
	drafts: Array<{ userId: string; name?: string; text: string }>;
}

function parseStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function parseMcpIssues(value: unknown): ChatMcpIssue[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			if (!item || typeof item !== "object" || Array.isArray(item)) {
				return null;
			}
			const record = item as Record<string, unknown>;
			if (
				typeof record.message !== "string" ||
				typeof record.code !== "string"
			) {
				return null;
			}
			const issue: ChatMcpIssue = {
				code: record.code,
				message: record.message,
			};
			if (typeof record.serverName === "string") {
				issue.serverName = record.serverName;
			}
			if (typeof record.source === "string") {
				issue.source = record.source;
			}
			if (typeof record.authRequired === "boolean") {
				issue.authRequired = record.authRequired;
			}
			return issue;
		})
		.filter((item): item is ChatMcpIssue => Boolean(item));
}

function parseMcpStatus(value: unknown): ChatMcpStatus | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	const record = value as Record<string, unknown>;
	const issues = parseMcpIssues(record.issues);
	const serverNames = parseStringArray(record.serverNames);
	const sources = parseStringArray(record.sources);
	const parsedErrors = parseStringArray(record.errors);
	const errors =
		parsedErrors.length > 0
			? parsedErrors
			: issues.map((issue) => issue.message);
	const updatedAt =
		typeof record.updatedAt === "string" ? record.updatedAt : undefined;
	return {
		issues,
		serverNames,
		sources,
		errors,
		...(updatedAt ? { updatedAt } : {}),
	};
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatMetadata(
	options: UseChatMetadataOptions,
): UseChatMetadataReturn {
	const { sessionDB, proxyUrl, sessionId, getHeaders } = options;

	const authHeaders = getHeaders ?? (() => ({}));

	// -----------------------------------------------------------------------
	// Title — derived from config-type chunks (title chunks remain)
	// -----------------------------------------------------------------------

	const chunks = useCollectionData(
		sessionDB?.collections.chunks ?? null,
	) as ChunkRow[];

	const title = useMemo(() => {
		let title: string | null = null;

		for (const row of chunks) {
			try {
				const parsed = JSON.parse(row.chunk);
				if (parsed.type === "config" && typeof parsed.title === "string") {
					title = parsed.title;
				}
			} catch {
				// skip unparseable
			}
		}

		return title;
	}, [chunks]);

	const mcp = useMemo(() => {
		let latestMcp: ChatMcpStatus | null = null;

		for (const row of chunks) {
			try {
				const parsed = JSON.parse(row.chunk);
				if (parsed.type === "config") {
					const mcpStatus = parseMcpStatus(parsed.mcp);
					if (mcpStatus) {
						latestMcp = mcpStatus;
					}
				}
			} catch {
				// skip unparseable
			}
		}

		return latestMcp;
	}, [chunks]);

	// -----------------------------------------------------------------------
	// Presence — users from presence collection
	// -----------------------------------------------------------------------

	const presenceRows = useCollectionData(
		sessionDB?.collections.presence ?? null,
	) as RawPresenceRow[];

	const users = useMemo(
		(): ChatUserPresence[] =>
			presenceRows
				.filter((r) => r.status !== "offline")
				.map((r) => ({
					userId: r.userId,
					deviceId: r.deviceId,
					name: r.name,
					status: r.status,
					lastSeenAt: r.lastSeenAt,
					draft: r.draft,
					cursorPosition: r.cursorPosition,
				})),
		[presenceRows],
	);

	// -----------------------------------------------------------------------
	// Agents — from agents collection
	// -----------------------------------------------------------------------

	const agentRows = useCollectionData(
		sessionDB?.collections.agents ?? null,
	) as AgentValue[];

	const agents = useMemo(
		(): ChatAgentPresence[] =>
			agentRows.map((r) => ({
				agentId: r.agentId,
				name: r.name,
				endpoint: r.endpoint,
				triggers: r.triggers,
				model: r.model,
				generationMessageId: r.generationMessageId,
			})),
		[agentRows],
	);

	// -----------------------------------------------------------------------
	// Presence mutations
	// -----------------------------------------------------------------------

	const basePresenceUrl = `${proxyUrl}/api/chat/${sessionId}/stream`;

	const updateStatus = useCallback(
		(userId: string, deviceId: string, status: ChatUserPresence["status"]) => {
			if (!sessionId) return;
			const endpoint = status === "offline" ? "logout" : "login";
			fetch(`${basePresenceUrl}/${endpoint}`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...authHeaders() },
				body: JSON.stringify({ userId, deviceId, status }),
			}).catch(console.error);
		},
		[basePresenceUrl, authHeaders, sessionId],
	);

	const updateDraft = useCallback(
		(
			userId: string,
			deviceId: string,
			text: string,
			cursorPosition?: number,
		) => {
			if (!sessionId) return;
			fetch(`${basePresenceUrl}/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...authHeaders() },
				body: JSON.stringify({
					userId,
					deviceId,
					status: "typing",
					draft: text,
					cursorPosition,
				}),
			}).catch(console.error);
		},
		[basePresenceUrl, authHeaders, sessionId],
	);

	const drafts = useMemo(
		() =>
			users
				.filter((u) => u.draft && u.draft.length > 0)
				.map((u) => ({
					userId: u.userId,
					name: u.name,
					text: u.draft as string,
				})),
		[users],
	);

	return {
		title,
		mcp,
		users,
		agents,
		updateStatus,
		updateDraft,
		drafts,
	};
}
