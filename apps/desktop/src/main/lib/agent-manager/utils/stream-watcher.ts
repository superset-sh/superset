import { SessionHost } from "@superset/durable-session/host";
import type { UIMessage } from "ai";
import { env } from "main/env.main";
import { getAvailableModels } from "./models";
import {
	resumeAgent,
	runAgent,
	sessionAbortControllers,
	sessionRunIds,
} from "./run-agent";

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

	constructor(options: { sessionId: string; authToken: string }) {
		this.sessionId = options.sessionId;

		this.host = new SessionHost({
			sessionId: options.sessionId,
			baseUrl: `${env.NEXT_PUBLIC_API_URL}/api/chat`,
			headers: { Authorization: `Bearer ${options.authToken}` },
		});

		this.host.on("message", ({ message }) => {
			const text = extractTextFromMessage(message);
			const hasFiles = message.parts?.some((p) => p.type === "file");
			if (!text.trim() && !hasFiles) return;

			void runAgent({
				sessionId: options.sessionId,
				text,
				message,
				host: this.host,
				modelId: this.host.config.model ?? "anthropic/claude-sonnet-4-5",
				cwd: this.host.config.cwd ?? process.env.HOME ?? "/",
				permissionMode: this.host.config.permissionMode,
				thinkingEnabled: this.host.config.thinkingEnabled,
				authToken: options.authToken,
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

	start(): void {
		this.host.start();
		this.host
			.postConfig({ availableModels: getAvailableModels() })
			.catch((err) => {
				console.warn(
					`[stream-watcher] Failed to post initial config for ${this.sessionId}:`,
					err,
				);
			});
	}

	stop(): void {
		this.host.stop();
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
