import type { RealtimeNudgeMessage } from "@superset/shared/realtime";
import {
	type VoiceToolResult,
	type VoiceUiDirective,
	voiceContextMessage,
} from "@superset/shared/voice";
import {
	applyUiDirective,
	type DirectiveRouter,
} from "../applyUiDirective/applyUiDirective";
import { RealtimeClient, type ToolCallRequest } from "../client/RealtimeClient";
import { describeScreen } from "../screenContext";
import { executeTool, toolSubject } from "../tools/executeTool";
import type { VoiceData, VoiceWorkspace } from "../tools/types";
import type { RealtimeTransport } from "../transport/RealtimeTransport";
import type { useVoiceLevelsStore } from "../voiceLevelsStore";
import type { VoiceStoreApi } from "../voiceStore";

const LEVELS_INTERVAL_MS = 100;
const RECONNECT_ATTEMPTS = 3;
const RECONNECT_BACKOFF_MS = [500, 1_500, 4_000];
/** Screen changes faster than this are scrolling, not a new subject. */
const SCREEN_CONTEXT_THROTTLE_MS = 1_500;
/** Keep the model's memory of a dropped session to what still matters. */
const HISTORY_SEED_ENTRIES = 12;
const WATCH_INTERVAL_MS = 6_000;
/** A launch reads as finished for a moment before the agent starts working. */
const WATCH_SETTLE_MS = 15_000;
const WATCH_OUTPUT_CHARS = 1_200;
/** A goodbye that never plays must not keep the microphone open. */
const END_REQUEST_FALLBACK_MS = 6_000;

export interface VoiceSessionDeps {
	store: VoiceStoreApi;
	levels: typeof useVoiceLevelsStore;
	data: VoiceData;
	mint: () => Promise<{ clientSecret: string }>;
	createTransport: () => RealtimeTransport;
	router: DirectiveRouter;
	getPathname: () => string;
	onRealtimeNudge: (
		listener: (message: RealtimeNudgeMessage) => void,
	) => () => void;
	newId: () => string;
	now: () => number;
}

/**
 * One voice session from start to end: mints a secret, opens the transport,
 * runs the conversation loop, executes tools, and moves the app. Lives
 * outside React so navigation never unmounts it.
 */
export class VoiceSessionController {
	private transport: RealtimeTransport | null = null;
	private client: RealtimeClient | null = null;
	private readonly knownWorkspaces = new Map<string, VoiceWorkspace>();
	private readonly cleanups: Array<() => void> = [];
	private levelsTimer: ReturnType<typeof setInterval> | null = null;
	private watchTimer: ReturnType<typeof setInterval> | null = null;
	private readonly watched = new Map<
		string,
		{ workspace: VoiceWorkspace; since: number; sawWorking: boolean }
	>();
	private lastScreen: { pathname: string; at: number } | null = null;
	private ended = false;
	private endRequested = false;
	private reconnecting = false;
	private checkingWatched = false;
	private endTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly deps: VoiceSessionDeps) {}

	async start(): Promise<void> {
		const store = this.deps.store.getState();
		store.begin(this.deps.now());
		try {
			await this.connect();
		} catch (error) {
			store.setError(
				error instanceof Error ? error.message : "Could not connect.",
			);
			this.end();
			throw error;
		}
		if (this.ended) return;
		this.cleanups.push(
			this.deps.onRealtimeNudge((message) => this.onNudge(message)),
		);
		this.levelsTimer = setInterval(() => {
			void this.transport?.getLevels().then((levels) => {
				if (!this.ended) this.deps.levels.getState().set(levels);
			});
		}, LEVELS_INTERVAL_MS);
		this.noteScreen(this.deps.getPathname(), true);
	}

	end(): void {
		if (this.ended) return;
		this.ended = true;
		if (this.levelsTimer) clearInterval(this.levelsTimer);
		if (this.watchTimer) clearInterval(this.watchTimer);
		this.watched.clear();
		if (this.endTimer) clearTimeout(this.endTimer);
		for (const cleanup of this.cleanups.splice(0)) cleanup();
		this.client?.stop();
		this.transport?.close();
		this.client = null;
		this.transport = null;
		this.deps.levels.getState().set({ input: 0, output: 0 });
		this.deps.store.getState().setStatus("ended");
	}

	setMuted(muted: boolean): void {
		this.transport?.setMuted(muted);
		this.deps.store.getState().setMuted(muted);
	}

	interrupt(): void {
		this.client?.interrupt();
	}

	sayText(text: string): void {
		this.deps.store
			.getState()
			.upsertSpeech(this.deps.newId(), "user", text, true);
		this.client?.sayText(text);
	}

	/** Reasoning and speed change mid-call; the next reply uses them. */
	applyLiveSettings(): void {
		const { reasoningEffort, speed } = this.deps.store.getState();
		this.client?.updateSession({
			reasoning: { effort: reasoningEffort },
			audio: { output: { speed } },
		});
	}

	/** A voice is fixed once it has spoken, so a new one needs a new session. */
	restart(): Promise<void> {
		return this.reconnect();
	}

	/** Called by the layer on every route change. */
	noteScreen(pathname: string, force = false): void {
		const now = this.deps.now();
		if (
			!force &&
			this.lastScreen &&
			(this.lastScreen.pathname === pathname ||
				now - this.lastScreen.at < SCREEN_CONTEXT_THROTTLE_MS)
		) {
			return;
		}
		this.lastScreen = { pathname, at: now };
		const text = describeScreen(pathname, {
			workspaceName: (id) => this.knownWorkspaces.get(id)?.name ?? null,
			pageTitle: () => null,
		});
		if (text) this.client?.addContext(voiceContextMessage(text));
	}

	private async connect(seed = false): Promise<void> {
		const clientSecret = this.deps.mint().then((minted) => minted.clientSecret);
		// Awaited inside the transport; a refusal must not also surface unhandled.
		clientSecret.catch(() => {});
		const transport = this.deps.createTransport();
		const client = new RealtimeClient(transport, {
			onStatus: (status) => {
				if (this.ended) return;
				if (this.endRequested && status === "listening") {
					this.end();
					return;
				}
				if (status === "speaking") this.deps.store.getState().setError(null);
				this.deps.store.getState().setStatus(status);
			},
			onUserTranscript: (id, text, final) =>
				this.deps.store.getState().upsertSpeech(id, "user", text, final),
			onAssistantTranscript: (id, text, final) =>
				this.deps.store.getState().upsertSpeech(id, "assistant", text, final),
			onToolCall: (call) => this.onToolCall(call),
			onError: (message) => this.deps.store.getState().setError(message),
		});
		this.cleanups.push(
			transport.onStateChange((state) => {
				if (this.ended) return;
				if (state === "failed" || state === "closed") void this.reconnect();
			}),
		);
		this.transport = transport;
		this.client = client;
		client.start();
		await transport.connect({ clientSecret });
		if (this.ended) {
			client.stop();
			transport.close();
			return;
		}
		if (this.deps.store.getState().muted) transport.setMuted(true);
		if (seed) this.seedHistory(client);
		this.deps.store.getState().setStatus("listening");
		this.deps.store.getState().setError(null);
	}

	private async reconnect(): Promise<void> {
		if (this.reconnecting || this.ended) return;
		this.reconnecting = true;
		try {
			await this.reconnectOnce();
		} finally {
			this.reconnecting = false;
		}
	}

	private async reconnectOnce(): Promise<void> {
		const store = this.deps.store.getState();
		store.setStatus("reconnecting");
		this.client?.stop();
		this.transport?.close();
		this.client = null;
		this.transport = null;
		for (
			let attempt = 0;
			attempt < RECONNECT_ATTEMPTS && !this.ended;
			attempt++
		) {
			await new Promise((resolve) =>
				setTimeout(resolve, RECONNECT_BACKOFF_MS[attempt] ?? 4_000),
			);
			if (this.ended) return;
			try {
				await this.connect(true);
				return;
			} catch {
				// Try again; the last failure ends the session below.
			}
		}
		if (!this.ended) {
			store.setError("Lost the connection and could not get it back.");
			this.end();
		}
	}

	/** The OpenAI session died with the link; what was said is ours to replay. */
	private seedHistory(client: RealtimeClient): void {
		const entries = this.deps.store
			.getState()
			.transcript.flatMap((entry) =>
				entry.role === "tool" || !entry.final || !entry.text.trim()
					? []
					: [{ role: entry.role, text: entry.text }],
			)
			.slice(-HISTORY_SEED_ENTRIES);
		if (entries.length === 0) return;
		client.addContext(
			voiceContextMessage(
				"The connection dropped and was restored. The conversation so far follows; continue without repeating it.",
			),
		);
		client.seedHistory(entries);
	}

	private async onToolCall(call: ToolCallRequest): Promise<VoiceToolResult> {
		const store = this.deps.store.getState();
		const rowId = this.deps.newId();
		store.addTool(rowId, call.name, toolSubject(call.args));
		const data = this.trackingData();
		const result = await executeTool(call.name, call.args, {
			data,
			now: this.deps.now,
			endSession: () => this.requestEnd(),
			getPathname: this.deps.getPathname,
			watchSession: (workspace, terminalId) =>
				this.watchSession(workspace, terminalId),
		});
		const failed =
			typeof result.output === "object" &&
			result.output !== null &&
			"error" in result.output;
		store.settleTool(rowId, failed ? "failed" : "done");
		if (typeof __DEV__ !== "undefined" && __DEV__) {
			console.log(
				"VOICETOOL",
				JSON.stringify({
					name: call.name,
					args: call.args,
					output: result.output,
					ui: result.ui,
					pathname: this.deps.getPathname(),
				}).slice(0, 1500),
			);
		}
		this.applyDirective(result.ui);
		return result;
	}

	private watchSession(workspace: VoiceWorkspace, terminalId: string): void {
		this.knownWorkspaces.set(workspace.id, workspace);
		this.watched.set(terminalId, {
			workspace,
			since: this.deps.now(),
			sawWorking: false,
		});
		this.watchTimer ??= setInterval(
			() => void this.checkWatched(),
			WATCH_INTERVAL_MS,
		);
	}

	/** Tells the model when an agent it started finishes, fails or needs the user. */
	async checkWatched(): Promise<void> {
		if (this.checkingWatched) return;
		this.checkingWatched = true;
		try {
			await this.checkWatchedOnce();
		} finally {
			this.checkingWatched = false;
		}
	}

	private async checkWatchedOnce(): Promise<void> {
		for (const [terminalId, entry] of [...this.watched]) {
			const sessions = await this.deps.data
				.listSessions(entry.workspace)
				.catch(() => null);
			if (this.ended) return;
			if (!sessions) continue;
			const session = sessions.find((row) => row.terminalId === terminalId);
			if (!session) {
				this.watched.delete(terminalId);
				continue;
			}
			if (session.attention === "working") {
				entry.sawWorking = true;
				continue;
			}
			const settled =
				entry.sawWorking || this.deps.now() - entry.since > WATCH_SETTLE_MS;
			if (!session.attention || !settled) continue;
			this.watched.delete(terminalId);
			const words =
				session.attention === "review"
					? "finished"
					: session.attention === "permission"
						? "is waiting for permission"
						: "failed";
			const output = await this.deps.data
				.readTranscript(entry.workspace, session, WATCH_OUTPUT_CHARS)
				.catch(() => "");
			if (this.ended) return;
			this.client?.addContext(
				voiceContextMessage(
					`The agent you started (session "${session.title}") ${words}. Tell the user the result in one or two sentences.${
						output ? ` Its output ends:\n${output}` : ""
					}`,
				),
				true,
			);
		}
		if (this.watched.size === 0 && this.watchTimer) {
			clearInterval(this.watchTimer);
			this.watchTimer = null;
		}
	}

	/** Ends once the goodbye has played, so the model is not cut off mid-word. */
	private requestEnd(): void {
		if (this.endRequested) return;
		this.endRequested = true;
		this.endTimer = setTimeout(() => this.end(), END_REQUEST_FALLBACK_MS);
	}

	private applyDirective(directive: VoiceUiDirective | undefined) {
		if (!directive?.navigate) return;
		const state = this.deps.store.getState();
		const target = directive.navigate;
		if ("workspaceId" in target) {
			state.setFocusLabel(
				this.knownWorkspaces.get(target.workspaceId)?.name ?? null,
			);
		} else if (target.screen === "home") {
			state.setFocusLabel(null);
		}
		applyUiDirective(directive, {
			router: this.deps.router,
			pathname: this.deps.getPathname(),
		});
	}

	/** Remembers names as they stream past so screens and nudges can be worded. */
	private trackingData(): VoiceData {
		const data = this.deps.data;
		return {
			...data,
			listWorkspaces: async () => {
				const workspaces = await data.listWorkspaces();
				for (const workspace of workspaces) {
					this.knownWorkspaces.set(workspace.id, workspace);
				}
				return workspaces;
			},
		};
	}

	private onNudge(message: RealtimeNudgeMessage): void {
		const state = this.deps.store.getState();
		for (const update of message.updates) {
			if (
				update.kind !== "cloud_workspaces" ||
				update.agentStatus === undefined
			) {
				continue;
			}
			const name = this.knownWorkspaces.get(update.workspaceId)?.name;
			if (!name) continue;
			const status = update.agentStatus;
			const words =
				status === "review"
					? "finished and is waiting for the user"
					: status === "permission"
						? "is waiting for permission"
						: status === "failed"
							? "failed"
							: status === "working"
								? "started working"
								: "went idle";
			const matters =
				status === "review" || status === "permission" || status === "failed";
			this.client?.addContext(
				voiceContextMessage(
					`Workspace ${name} ${words}.${
						matters && state.proactive
							? " Tell the user in one sentence if they are not mid-sentence."
							: ""
					}`,
				),
				matters && state.proactive && state.status === "listening",
			);
		}
	}
}
