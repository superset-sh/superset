import {
	type LoadedMcpToolsetsResult,
	loadMcpToolsetsForChat,
} from "@superset/agent";
import type { UIMessage } from "ai";
import type { GetHeaders } from "../../../lib/auth/auth";
import { sessionAbortControllers, sessionRunIds } from "../session-state";
import { resumeAgent, runAgent, writeMcpConfigChunk } from "./run-agent";
import { SessionHost } from "./session-host";

/**
 * StreamWatcher monitors a durable stream session for new user messages
 * from any client (web, desktop, mobile) and triggers the agent automatically.
 *
 * Delegates all stream protocol details to SessionHost — this file is a thin
 * wrapper that wires typed events to agent lifecycle functions.
 */
export class StreamWatcher {
	private host: SessionHost;
	private readonly sessionId: string;
	private readonly cwd: string;
	private readonly apiUrl: string;
	private readonly getHeaders: GetHeaders;
	private mcpToolsets: LoadedMcpToolsetsResult | null = null;
	private mcpLoadPromise: Promise<LoadedMcpToolsetsResult> | null = null;
	private status: "idle" | "starting" | "ready" = "idle";
	private startPromise: Promise<void> | null = null;

	constructor(options: {
		sessionId: string;
		apiUrl: string;
		cwd: string;
		getHeaders: GetHeaders;
	}) {
		this.sessionId = options.sessionId;
		this.cwd = options.cwd;
		this.apiUrl = options.apiUrl;
		this.getHeaders = options.getHeaders;

		this.host = new SessionHost({
			sessionId: options.sessionId,
			baseUrl: `${options.apiUrl}/api/chat`,
			getHeaders: options.getHeaders,
		});

		this.host.on("message", ({ message, metadata }) => {
			const text = extractTextFromMessage(message);
			const hasFiles = message.parts?.some((p) => p.type === "file");
			if (!text.trim() && !hasFiles) return;

			void (async () => {
				const mcpToolsets = await this.ensureMcpToolsets().catch((error) => {
					console.warn(
						`[stream-watcher] MCP preload failed for ${options.sessionId}:`,
						error,
					);
					return undefined;
				});

				await runAgent({
					sessionId: options.sessionId,
					text,
					message,
					host: this.host,
					modelId: metadata?.model ?? "anthropic/claude-sonnet-4-6",
					cwd: this.cwd,
					permissionMode: metadata?.permissionMode ?? "bypassPermissions",
					thinkingEnabled: metadata?.thinkingEnabled ?? false,
					apiUrl: options.apiUrl,
					getHeaders: options.getHeaders,
					...(mcpToolsets ? { mcpToolsets } : {}),
				});
			})();
		});

		this.host.on("toolResult", ({ answers }) => {
			const runId = sessionRunIds.get(options.sessionId);
			if (runId) {
				void resumeAgent({
					sessionId: options.sessionId,
					runId,
					host: this.host,
					approved: true,
					answers,
				});
			}
		});

		this.host.on("toolApproval", ({ approved, permissionMode }) => {
			const runId = sessionRunIds.get(options.sessionId);
			if (runId) {
				void resumeAgent({
					sessionId: options.sessionId,
					runId,
					host: this.host,
					approved,
					permissionMode,
				});
			}
		});

		this.host.on("abort", () => {
			sessionAbortControllers.get(options.sessionId)?.abort();
		});

		this.host.on("error", (err) => {
			console.error(`[stream-watcher] Error for ${options.sessionId}:`, err);
		});
	}

	get sessionHost() {
		return this.host;
	}

	start(): Promise<void> {
		if (this.status === "ready") {
			return Promise.resolve();
		}
		if (this.startPromise) return this.startPromise;

		this.status = "starting";
		this.startPromise = new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				cleanup();
				this.status = "idle";
				reject(
					new Error(
						`Timed out waiting for stream watcher readiness: ${this.sessionId}`,
					),
				);
			}, 10_000);

			const onConnected = () => {
				cleanup();
				this.status = "ready";
				void this.loadMcpStatusOnStart();
				resolve();
			};

			const onError = (err: Error) => {
				cleanup();
				this.status = "idle";
				reject(err);
			};

			const onDisconnected = ({ reason }: { reason?: string }) => {
				cleanup();
				this.status = "idle";
				reject(
					new Error(
						`Stream watcher disconnected before readiness for ${this.sessionId}${reason ? `: ${reason}` : ""}`,
					),
				);
			};

			const cleanup = () => {
				clearTimeout(timeout);
				this.host.off("connected", onConnected);
				this.host.off("error", onError);
				this.host.off("disconnected", onDisconnected);
			};

			this.host.on("connected", onConnected);
			this.host.on("error", onError);
			this.host.on("disconnected", onDisconnected);
			this.host.start();
		}).finally(() => {
			this.startPromise = null;
		});

		return this.startPromise;
	}

	stop(): void {
		const mcpToolsets = this.mcpToolsets;
		this.mcpToolsets = null;
		this.mcpLoadPromise = null;
		if (mcpToolsets) {
			void mcpToolsets.disconnect().catch((error) => {
				console.warn(
					`[stream-watcher] Failed to disconnect MCP toolsets for ${this.sessionId}:`,
					error,
				);
			});
		}

		this.host.stop();
		this.status = "idle";
		this.startPromise = null;
	}

	private async ensureMcpToolsets(): Promise<LoadedMcpToolsetsResult> {
		if (this.mcpToolsets) return this.mcpToolsets;
		if (this.mcpLoadPromise) return this.mcpLoadPromise;

		this.mcpLoadPromise = (async () => {
			let authHeaders: Record<string, string> = {};
			try {
				authHeaders = await this.getHeaders();
			} catch (error) {
				console.warn(
					`[stream-watcher] Failed to resolve auth headers for ${this.sessionId}:`,
					error,
				);
			}

			const loaded = await loadMcpToolsetsForChat({
				cwd: this.cwd,
				apiUrl: this.apiUrl,
				authHeaders,
			});
			this.mcpToolsets = loaded;
			return loaded;
		})().finally(() => {
			this.mcpLoadPromise = null;
		});

		return this.mcpLoadPromise;
	}

	private async loadMcpStatusOnStart(): Promise<void> {
		try {
			const mcpToolsets = await this.ensureMcpToolsets();
			await writeMcpConfigChunk(this.host, {
				serverNames: mcpToolsets.serverNames,
				sources: mcpToolsets.sources,
				errors: mcpToolsets.errors,
			});
		} catch (error) {
			console.warn(
				`[stream-watcher] Failed to load MCP status for ${this.sessionId}:`,
				error,
			);
		}
	}
}

function extractTextFromMessage(message: UIMessage): string {
	const parts = Array.isArray(message.parts) ? message.parts : [];
	const texts: string[] = [];
	for (const part of parts) {
		if (part.type === "text") {
			texts.push(part.text);
		}
	}
	return texts.join("\n");
}
