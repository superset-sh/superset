import { useSyncExternalStore, useCallback } from "react";
import type { SessionDB } from "../collection";
import type { ChunkRow, RawPresenceRow, AgentValue } from "../schema";

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
	const { sessionDB, proxyUrl, sessionId } = options;

	const url = (path: string) =>
		`${proxyUrl}/api/streams/v1/sessions/${sessionId}${path}`;

	// -----------------------------------------------------------------------
	// Config + Title — derived from config events in the chunk stream
	// -----------------------------------------------------------------------

	const subscribeToChunks = useCallback(
		(callback: () => void) => {
			const subscription = sessionDB.collections.chunks.subscribeChanges(
				() => callback(),
			);
			return () => subscription.unsubscribe();
		},
		[sessionDB],
	);

	const getConfigSnapshot = useCallback((): {
		title: string | null;
		config: SessionConfig;
	} => {
		let title: string | null = null;
		let config: SessionConfig = {};

		for (const row of sessionDB.collections.chunks.values()) {
			const chunkRow = row as ChunkRow;
			try {
				const parsed = JSON.parse(chunkRow.chunk);
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
				// skip
			}
		}

		return { title, config };
	}, [sessionDB]);

	const { title, config } = useSyncExternalStore(
		subscribeToChunks,
		getConfigSnapshot,
		() => ({ title: null, config: {} }),
	);

	const updateConfig = useCallback(
		(newConfig: SessionConfig) => {
			fetch(url("/config"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(newConfig),
				credentials: "include",
			}).catch(console.error);
		},
		[url],
	);

	// -----------------------------------------------------------------------
	// Presence — users + agents from presence/agents collections
	// -----------------------------------------------------------------------

	const subscribeToPresence = useCallback(
		(callback: () => void) => {
			const subscription = sessionDB.collections.presence.subscribeChanges(
				() => callback(),
			);
			return () => subscription.unsubscribe();
		},
		[sessionDB],
	);

	const getPresenceSnapshot = useCallback((): ChatUserPresence[] => {
		const rows = Array.from(
			sessionDB.collections.presence.values(),
		) as RawPresenceRow[];
		return rows
			.filter((r) => r.status !== "offline")
			.map((r) => ({
				userId: r.userId,
				deviceId: r.deviceId,
				name: r.name,
				status: r.status,
				lastSeenAt: r.lastSeenAt,
				draft: r.draft,
				cursorPosition: r.cursorPosition,
			}));
	}, [sessionDB]);

	const subscribeToAgents = useCallback(
		(callback: () => void) => {
			const subscription = sessionDB.collections.agents.subscribeChanges(
				() => callback(),
			);
			return () => subscription.unsubscribe();
		},
		[sessionDB],
	);

	const getAgentsSnapshot = useCallback((): ChatAgentPresence[] => {
		const rows = Array.from(
			sessionDB.collections.agents.values(),
		) as AgentValue[];
		return rows.map((r) => ({
			agentId: r.agentId,
			name: r.name,
			endpoint: r.endpoint,
			triggers: r.triggers,
			model: r.model,
			generationMessageId: r.generationMessageId,
		}));
	}, [sessionDB]);

	const users = useSyncExternalStore(
		subscribeToPresence,
		getPresenceSnapshot,
		() => [],
	);
	const agents = useSyncExternalStore(
		subscribeToAgents,
		getAgentsSnapshot,
		() => [],
	);

	const updateStatus = useCallback(
		(userId: string, deviceId: string, status: ChatUserPresence["status"]) => {
			const endpoint = status === "offline" ? "logout" : "login";
			fetch(url(`/${endpoint}`), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId, deviceId, status }),
				credentials: "include",
			}).catch(console.error);
		},
		[url],
	);

	const updateDraft = useCallback(
		(
			userId: string,
			deviceId: string,
			text: string,
			cursorPosition?: number,
		) => {
			fetch(url("/login"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userId,
					deviceId,
					status: "typing",
					draft: text,
					cursorPosition,
				}),
				credentials: "include",
			}).catch(console.error);
		},
		[url],
	);

	const drafts = users
		.filter((u) => u.draft && u.draft.length > 0)
		.map((u) => ({ userId: u.userId, name: u.name, text: u.draft! }));

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
