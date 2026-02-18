import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import type { SessionDB } from "../../../../session-db/session-db";
import type { AgentValue, ChunkRow, RawPresenceRow } from "../../../../schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlashCommand {
	name: string;
	description: string;
	argumentHint: string;
}

export interface ModelOption {
	id: string;
	name: string;
	provider: string;
}

export interface SessionConfig {
	model?: string;
	permissionMode?: string;
	thinkingEnabled?: boolean;
	cwd?: string;
	slashCommands?: SlashCommand[];
	availableModels?: ModelOption[];
}

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

export interface UseChatMetadataOptions {
	sessionDB: SessionDB;
	proxyUrl: string;
	sessionId: string;
	getHeaders?: () => Record<string, string>;
}

export interface UseChatMetadataReturn {
	/** Current session title (derived from stream config events). */
	title: string | null;
	/** Current session config (derived from stream config events). */
	config: SessionConfig;
	/** Update config — posts a config event to the durable stream. */
	updateConfig: (config: SessionConfig) => void;
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatMetadata(
	options: UseChatMetadataOptions,
): UseChatMetadataReturn {
	const { sessionDB, proxyUrl, sessionId, getHeaders } = options;

	const authHeaders = getHeaders ?? (() => ({}));
	const configUrl = `${proxyUrl}/api/streams/v1/sessions/${sessionId}/config`;

	// -----------------------------------------------------------------------
	// Config + Title — derived from config-type chunks
	// -----------------------------------------------------------------------

	const { data: chunks } = useLiveQuery(
		(q) =>
			q
				.from({ chunks: sessionDB.collections.chunks })
				.select(({ chunks }) => chunks),
		[sessionDB.collections.chunks],
	);

	const { title, config } = useMemo(() => {
		let title: string | null = null;
		const config: SessionConfig = {};

		for (const row of (chunks ?? []) as ChunkRow[]) {
			try {
				const parsed = JSON.parse(row.chunk);
				if (parsed.type === "config") {
					if (typeof parsed.model === "string") config.model = parsed.model;
					if (typeof parsed.permissionMode === "string")
						config.permissionMode = parsed.permissionMode;
					if (typeof parsed.thinkingEnabled === "boolean")
						config.thinkingEnabled = parsed.thinkingEnabled;
					if (typeof parsed.cwd === "string") config.cwd = parsed.cwd;
					if (Array.isArray(parsed.slashCommands))
						config.slashCommands = parsed.slashCommands;
					if (Array.isArray(parsed.availableModels))
						config.availableModels = parsed.availableModels;
					if (typeof parsed.title === "string") title = parsed.title;
				}
			} catch {
				// skip unparseable
			}
		}

		return { title, config };
	}, [chunks]);

	const updateConfig = useCallback(
		(newConfig: SessionConfig) => {
			fetch(configUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...authHeaders() },
				body: JSON.stringify(newConfig),
			}).catch(console.error);
		},
		[configUrl, authHeaders],
	);

	// -----------------------------------------------------------------------
	// Presence — users from presence collection
	// -----------------------------------------------------------------------

	const { data: presenceRows } = useLiveQuery(
		(q) =>
			q
				.from({ presence: sessionDB.collections.presence })
				.select(({ presence }) => presence),
		[sessionDB.collections.presence],
	);

	const users = useMemo(
		(): ChatUserPresence[] =>
			((presenceRows ?? []) as RawPresenceRow[])
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

	const { data: agentRows } = useLiveQuery(
		(q) =>
			q
				.from({ agents: sessionDB.collections.agents })
				.select(({ agents }) => agents),
		[sessionDB.collections.agents],
	);

	const agents = useMemo(
		(): ChatAgentPresence[] =>
			((agentRows ?? []) as AgentValue[]).map((r) => ({
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

	const basePresenceUrl = `${proxyUrl}/api/streams/v1/sessions/${sessionId}`;

	const updateStatus = useCallback(
		(userId: string, deviceId: string, status: ChatUserPresence["status"]) => {
			const endpoint = status === "offline" ? "logout" : "login";
			fetch(`${basePresenceUrl}/${endpoint}`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...authHeaders() },
				body: JSON.stringify({ userId, deviceId, status }),
			}).catch(console.error);
		},
		[basePresenceUrl, authHeaders],
	);

	const updateDraft = useCallback(
		(
			userId: string,
			deviceId: string,
			text: string,
			cursorPosition?: number,
		) => {
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
		[basePresenceUrl, authHeaders],
	);

	const drafts = useMemo(
		() =>
			users
				.filter((u) => u.draft && u.draft.length > 0)
				.map((u) => ({ userId: u.userId, name: u.name, text: u.draft! })),
		[users],
	);

	return {
		title,
		config,
		updateConfig,
		users,
		agents,
		updateStatus,
		updateDraft,
		drafts,
	};
}
