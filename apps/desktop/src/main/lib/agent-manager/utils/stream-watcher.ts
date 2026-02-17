import { createSessionDB, type SessionDB } from "@superset/durable-session";
import type { ChunkRow } from "@superset/durable-session";
import { env } from "main/env.main";
import { getAvailableModels } from "./models";
import {
	runAgent,
	resumeAgent,
	sessionAbortControllers,
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
 * It also detects tool result / approval / control / config chunks flowing
 * back from clients and handles them accordingly.
 */
export class StreamWatcher {
	private sessionDB: SessionDB | null = null;
	private config: SessionConfig;
	private readonly sessionId: string;
	private readonly seenMessageIds = new Set<string>();
	private unsubscribe: (() => void) | null = null;
	private abortController: AbortController;

	private readonly authToken: string;

	constructor(options: {
		sessionId: string;
		config: SessionConfig;
		authToken: string;
	}) {
		this.sessionId = options.sessionId;
		this.config = options.config;
		this.authToken = options.authToken;
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
			headers: { Authorization: `Bearer ${this.authToken}` },
			signal: this.abortController.signal,
		});

		// Seed seenMessageIds from existing chunks so we don't re-trigger on history.
		// Also replay the latest config event to initialize config from stream.
		const chunks = this.sessionDB.collections.chunks;
		console.log(
			`[stream-watcher] Session ${this.sessionId} — chunks collection exists: ${!!chunks}, size: ${chunks?.size ?? 0}`,
		);
		let latestConfig: Record<string, unknown> | null = null;

		for (const row of chunks.values()) {
			const chunkRow = row as ChunkRow;
			try {
				const parsed = JSON.parse(chunkRow.chunk);
				if (parsed.type === "whole-message" && parsed.message?.role === "user") {
					this.seenMessageIds.add(chunkRow.messageId);
				}
				if (parsed.type === "config") {
					latestConfig = parsed;
				}
			} catch {
				// skip unparseable
			}
		}

		// Apply latest config from stream history
		if (latestConfig) {
			this.applyConfig(latestConfig);
		}

		// Subscribe to chunk changes
		const subscription = chunks.subscribeChanges((changes) => {
			console.log(
				`[stream-watcher] Session ${this.sessionId} — ${changes.length} chunk changes`,
			);
			for (const change of changes) {
				console.log(
					`[stream-watcher] Change: type=${change.type}`,
				);
				if (change.type !== "insert" && change.type !== "update") continue;
				const row = change.value as ChunkRow;

				try {
					const parsed = JSON.parse(row.chunk);
					console.log(
						`[stream-watcher] Parsed chunk: type=${parsed.type} messageId=${row.messageId} role=${row.role}`,
					);
					this.handleChunk(parsed, row);
				} catch {
					// skip unparseable
				}
			}
		});

		this.unsubscribe = () => subscription.unsubscribe();

		// Write available models to the stream so clients can display them
		void this.writeInitialConfig(apiUrl);

		console.log(
			`[stream-watcher] Started watching session ${this.sessionId}`,
		);
	}

	private async writeInitialConfig(apiUrl: string): Promise<void> {
		try {
			await fetch(
				`${apiUrl}/api/streams/v1/sessions/${this.sessionId}/config`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.authToken}`,
					},
					body: JSON.stringify({
						availableModels: getAvailableModels(),
					}),
				},
			);
		} catch (err) {
			console.error(
				`[stream-watcher] Failed to write initial config for ${this.sessionId}:`,
				err,
			);
		}
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

		// --- Control event: abort agent ---
		if (parsed.type === "control") {
			if (parsed.action === "abort") {
				const controller = sessionAbortControllers.get(this.sessionId);
				if (controller) {
					console.log(
						`[stream-watcher] Aborting agent for session ${this.sessionId}`,
					);
					controller.abort();
				}
			}
		}

		// --- Config event: update runtime config ---
		if (parsed.type === "config") {
			this.applyConfig(parsed);
		}
	}

	private applyConfig(config: Record<string, unknown>): void {
		if (typeof config.model === "string") this.config.modelId = config.model;
		if (typeof config.cwd === "string") this.config.cwd = config.cwd;
		if (typeof config.permissionMode === "string")
			this.config.permissionMode = config.permissionMode;
		if (typeof config.thinkingEnabled === "boolean")
			this.config.thinkingEnabled = config.thinkingEnabled;
		console.log(
			`[stream-watcher] Config updated for session ${this.sessionId}:`,
			{
				modelId: this.config.modelId,
				cwd: this.config.cwd,
				permissionMode: this.config.permissionMode,
				thinkingEnabled: this.config.thinkingEnabled,
			},
		);
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
