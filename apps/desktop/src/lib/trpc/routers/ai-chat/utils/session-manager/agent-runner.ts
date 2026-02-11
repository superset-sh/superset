import type { SessionStore } from "../session-store";
import type { ResolvePermissionInput } from "./agent-execution";
import { AgentExecution } from "./agent-execution";
import { AgentStreamWriter } from "./agent-stream-writer";
import type { ChunkBatcher } from "./chunk-batcher";
import type { GenerationWatchdog } from "./generation-watchdog";
import type { PermissionRequestEvent } from "./session-events";
import type { ActiveSession, EnsureSessionReadyInput } from "./session-types";

export type { ResolvePermissionInput } from "./agent-execution";

export interface StartAgentInput {
	sessionId: string;
	prompt: string;
}

interface AgentRunnerDeps {
	store: SessionStore;
	sessions: Map<string, ActiveSession>;
	runningAgents: Map<string, AbortController>;
	proxyUrl: string;
	emitSessionError: (params: { sessionId: string; error: string }) => void;
	emitPermissionRequest: (event: PermissionRequestEvent) => void;
	ensureSessionReady: (input: EnsureSessionReadyInput) => Promise<void>;
}

export class AgentRunner {
	private readonly execution: AgentExecution;
	private readonly streamWriter: AgentStreamWriter;

	constructor(private readonly deps: AgentRunnerDeps) {
		this.execution = new AgentExecution({
			store: deps.store,
			emitPermissionRequest: deps.emitPermissionRequest,
		});
		this.streamWriter = new AgentStreamWriter({
			proxyUrl: deps.proxyUrl,
			emitSessionError: deps.emitSessionError,
			ensureSessionReady: deps.ensureSessionReady,
			isSessionActive: (sessionId) => this.deps.sessions.has(sessionId),
		});
	}

	private abortExistingAgent({ sessionId }: { sessionId: string }): void {
		const existingController = this.deps.runningAgents.get(sessionId);
		if (!existingController) return;
		console.warn(`[chat/session] Aborting previous agent run for ${sessionId}`);
		existingController.abort();
		if (this.deps.runningAgents.get(sessionId) === existingController) {
			this.deps.runningAgents.delete(sessionId);
		}
	}

	async startAgent({ sessionId, prompt }: StartAgentInput): Promise<void> {
		const session = this.deps.sessions.get(sessionId);
		if (!session) {
			console.error(
				`[chat/session] Session ${sessionId} not found for startAgent`,
			);
			this.deps.emitSessionError({
				sessionId,
				error: "Session not active",
			});
			return;
		}

		this.abortExistingAgent({ sessionId });

		const abortController = new AbortController();
		this.deps.runningAgents.set(sessionId, abortController);

		const messageId = crypto.randomUUID();
		let headers: Record<string, string> | null = null;
		let batcher: ChunkBatcher | null = null;
		let watchdog: GenerationWatchdog | null = null;

		try {
			const prepared = await this.streamWriter.prepareStream({
				sessionId,
				session,
				abortController,
			});
			headers = prepared.headers;
			batcher = prepared.batcher;
			watchdog = prepared.watchdog;

			await this.execution.execute({
				session,
				sessionId,
				prompt,
				abortController,
				onChunk: (chunk) => {
					this.streamWriter.onAssistantChunk({
						watchdog: watchdog as GenerationWatchdog,
						batcher: batcher as ChunkBatcher,
						messageId,
						chunk,
					});
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!abortController.signal.aborted) {
				console.error(
					`[chat/session] Agent execution failed for ${sessionId}:`,
					message,
				);
				this.deps.emitSessionError({ sessionId, error: message });
			} else if (watchdog?.wasTriggered) {
				console.warn(
					`[chat/session] Agent aborted by watchdog for ${sessionId}:`,
					message,
				);
			}
		} finally {
			watchdog?.clear();
			await this.streamWriter.drainChunkBatcher({
				sessionId,
				batcher,
				abortController,
			});
			await this.streamWriter.finalizeGeneration({
				sessionId,
				session,
				messageId,
				headers,
			});
			if (this.deps.runningAgents.get(sessionId) === abortController) {
				this.deps.runningAgents.delete(sessionId);
			}
		}
	}

	resolvePermission(input: ResolvePermissionInput): void {
		this.execution.resolvePermission(input);
	}
}
