import type { UIMessage } from "ai";
import type { DataResolver } from "../../data-resolver";
import { sessionAbortControllers, sessionRunIds } from "../session-state";
import { resumeAgent, runAgent } from "./run-agent";
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
	private readonly dataResolver: DataResolver;
	private status: "idle" | "starting" | "ready" = "idle";
	private startPromise: Promise<void> | null = null;

	constructor(options: {
		sessionId: string;
		authToken: string;
		apiUrl: string;
		cwd: string;
		dataResolver: DataResolver;
	}) {
		this.sessionId = options.sessionId;
		this.cwd = options.cwd;
		this.dataResolver = options.dataResolver;

		this.host = new SessionHost({
			sessionId: options.sessionId,
			baseUrl: `${options.apiUrl}/api/chat`,
			headers: { Authorization: `Bearer ${options.authToken}` },
		});

		this.host.on("message", ({ message, metadata }) => {
			const text = extractTextFromMessage(message);
			const hasFiles = message.parts?.some((p) => p.type === "file");
			if (!text.trim() && !hasFiles) return;

			void runAgent({
				sessionId: options.sessionId,
				text,
				message,
				host: this.host,
				modelId: metadata?.model ?? "anthropic/claude-sonnet-4-6",
				cwd: this.cwd,
				permissionMode: metadata?.permissionMode ?? "bypassPermissions",
				thinkingEnabled: metadata?.thinkingEnabled ?? false,
				authToken: options.authToken,
				apiUrl: options.apiUrl,
				dataResolver: this.dataResolver,
			});
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
		this.host.stop();
		this.status = "idle";
		this.startPromise = null;
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
