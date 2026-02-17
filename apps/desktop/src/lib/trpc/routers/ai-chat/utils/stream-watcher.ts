import { createSessionDB, type SessionDB } from "@superset/durable-session";
import type { ChunkRow } from "@superset/durable-session";
import { env } from "main/env.main";
import {
	runAgent,
	resumeAgent,
	sessionRunIds,
	type RunAgentOptions,
} from "./run-agent";

export interface SessionConfig {
	cwd: string;
	modelId: string;
	permissionMode?: string;
	thinkingEnabled?: boolean;
}

/**
 * StreamWatcher monitors a durable stream session for new user messages
 * from any client (web, desktop, mobile) and triggers the agent automatically.
 *
 * It also detects tool result / approval chunks flowing back from clients
 * and resumes the agent accordingly.
 */
export class StreamWatcher {
	private sessionDB: SessionDB | null = null;
	private config: SessionConfig;
	private readonly sessionId: string;
	private readonly seenMessageIds = new Set<string>();
	private unsubscribe: (() => void) | null = null;
	private abortController: AbortController;

	constructor(options: {
		sessionId: string;
		config: SessionConfig;
	}) {
		this.sessionId = options.sessionId;
		this.config = options.config;
		this.abortController = new AbortController();
	}

	start(): void {
		const apiUrl = env.NEXT_PUBLIC_API_URL;
		if (!apiUrl) {
			console.error("[stream-watcher] No API URL configured");
			return;
		}

		this.sessionDB = createSessionDB({
			sessionId: this.sessionId,
			baseUrl: `${apiUrl}/api/streams`,
			signal: this.abortController.signal,
		});

		// Seed seenMessageIds from existing chunks so we don't re-trigger on history
		const chunks = this.sessionDB.collections.chunks;
		for (const row of chunks.values()) {
			const chunkRow = row as ChunkRow;
			try {
				const parsed = JSON.parse(chunkRow.chunk);
				if (parsed.type === "whole-message" && parsed.message?.role === "user") {
					this.seenMessageIds.add(chunkRow.messageId);
				}
			} catch {
				// skip unparseable
			}
		}

		// Subscribe to chunk changes
		const subscription = chunks.subscribeChanges((changes) => {
			for (const change of changes) {
				if (change.type !== "insert" && change.type !== "update") continue;
				const row = change.value as ChunkRow;

				try {
					const parsed = JSON.parse(row.chunk);
					this.handleChunk(parsed, row);
				} catch {
					// skip unparseable
				}
			}
		});

		this.unsubscribe = () => subscription.unsubscribe();

		console.log(
			`[stream-watcher] Started watching session ${this.sessionId}`,
		);
	}

	private handleChunk(
		parsed: Record<string, unknown>,
		row: ChunkRow,
	): void {
		// --- User message: trigger agent ---
		if (
			parsed.type === "whole-message" &&
			typeof parsed.message === "object" &&
			parsed.message !== null
		) {
			const msg = parsed.message as Record<string, unknown>;
			if (msg.role !== "user") return;
			if (this.seenMessageIds.has(row.messageId)) return;
			this.seenMessageIds.add(row.messageId);

			// Extract text content from message parts
			const parts = Array.isArray(msg.parts) ? msg.parts : [];
			const text = parts
				.filter(
					(p: unknown): p is { type: string; text: string } =>
						typeof p === "object" &&
						p !== null &&
						(p as Record<string, unknown>).type === "text",
				)
				.map((p) => p.text)
				.join("\n");

			if (!text.trim()) return;

			console.log(
				`[stream-watcher] New user message in ${this.sessionId}: "${text.slice(0, 50)}"`,
			);

			const agentOpts: RunAgentOptions = {
				sessionId: this.sessionId,
				text,
				modelId: this.config.modelId,
				cwd: this.config.cwd,
				permissionMode: this.config.permissionMode,
				thinkingEnabled: this.config.thinkingEnabled,
			};

			// Fire and forget — runAgent manages its own lifecycle
			void runAgent(agentOpts);
		}

		// --- Tool result: resume agent ---
		if (parsed.type === "tool-result") {
			const runId = sessionRunIds.get(this.sessionId);
			if (!runId) return;

			const result = parsed as Record<string, unknown>;
			const answers =
				typeof result.answers === "object" && result.answers !== null
					? (result.answers as Record<string, string>)
					: undefined;

			void resumeAgent({
				sessionId: this.sessionId,
				runId,
				approved: true,
				answers,
			});
		}

		// --- Tool approval: resume agent ---
		if (parsed.type === "tool-approval") {
			const runId = sessionRunIds.get(this.sessionId);
			if (!runId) return;

			const approval = parsed as Record<string, unknown>;
			const approved = approval.approved === true;

			void resumeAgent({
				sessionId: this.sessionId,
				runId,
				approved,
				permissionMode:
					typeof approval.permissionMode === "string"
						? approval.permissionMode
						: undefined,
			});
		}
	}

	updateConfig(config: Partial<SessionConfig>): void {
		if (config.cwd !== undefined) this.config.cwd = config.cwd;
		if (config.modelId !== undefined) this.config.modelId = config.modelId;
		if (config.permissionMode !== undefined)
			this.config.permissionMode = config.permissionMode;
		if (config.thinkingEnabled !== undefined)
			this.config.thinkingEnabled = config.thinkingEnabled;
	}

	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.abortController.abort();
		this.sessionDB = null;
		console.log(
			`[stream-watcher] Stopped watching session ${this.sessionId}`,
		);
	}
}
