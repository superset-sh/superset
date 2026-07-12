import type {
	ContentBlock as AcpContentBlock,
	StopReason as AcpStopReason,
	RequestPermissionOutcome,
	SessionConfigOption,
	SessionScopedState,
	SessionUpdate,
	SessionUpdateEnvelope,
	SessionUpdateFrame,
} from "@superset/session-protocol";
import { AcpSessionNotFoundError } from "../../acp-sessions";
import {
	type AcpSessionsPort,
	CanonicalSessionsRuntime,
} from "../canonical-sessions";

export const T0 = 1_784_000_000_000;
export const WORKSPACE = "workspace-test";

export const MODEL_OPTIONS = [
	{
		id: "model",
		name: "Model",
		category: "model" as const,
		type: "select" as const,
		currentValue: "claude-sonnet-5",
		options: [
			{ value: "claude-sonnet-5", name: "Sonnet" },
			{ value: "claude-fable-5", name: "Fable" },
		],
	},
];

/**
 * Deterministic in-memory stand-in for AcpSessionManager, reproducing the
 * journal semantics the runtime depends on: synchronous fan-out, seq from 1,
 * a state-frame seed on create, prompt journaling user chunks before it
 * returns, permission park/settle, resurrection restarting seqs, and
 * ring-buffer eviction answering stale subscribes with a reset frame.
 */
export class FakeAcpPort implements AcpSessionsPort {
	private tick = 0;
	readonly sessions = new Map<
		string,
		{
			state: SessionScopedState;
			journal: SessionUpdateEnvelope[];
			seq: number;
			subscribers: Set<(envelope: SessionUpdateEnvelope) => void>;
			pendingPermissionIds: Set<string>;
			/** Frames session/load would replay after a resurrection. */
			resurrectFrames: SessionUpdateFrame[];
		}
	>();
	createCalls = 0;
	promptCalls = 0;
	cancelCalls = 0;
	respondCalls: Array<{
		requestId: string;
		outcome: RequestPermissionOutcome;
	}> = [];

	private nextTs(): number {
		this.tick += 1;
		return T0 + this.tick;
	}

	seed(sessionId: string, overrides: Partial<SessionScopedState> = {}) {
		const now = this.nextTs();
		const session = {
			state: {
				sessionId,
				workspaceId: WORKSPACE,
				harness: "claude-agent-acp" as const,
				status: "idle" as const,
				title: null,
				currentMode: null,
				configOptions: [],
				pendingPermissions: [],
				cwd: "/tmp/workspace",
				lastSeq: 0,
				lastStopReason: null,
				lastError: null,
				createdAt: now,
				updatedAt: now,
				...overrides,
			},
			journal: [],
			seq: 0,
			subscribers: new Set<(envelope: SessionUpdateEnvelope) => void>(),
			pendingPermissionIds: new Set<string>(),
			resurrectFrames: [] as SessionUpdateFrame[],
		};
		this.sessions.set(sessionId, session);
		return session;
	}

	private require(sessionId: string) {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new AcpSessionNotFoundError(`Unknown ACP session: ${sessionId}`);
		}
		return session;
	}

	private requireLive(sessionId: string) {
		const session = this.require(sessionId);
		if (session.state.status === "offline" || session.state.status === "dead") {
			throw new Error(`ACP session not live: ${sessionId}`);
		}
		return session;
	}

	journalFrame(sessionId: string, frame: SessionUpdateFrame) {
		const session = this.require(sessionId);
		session.seq += 1;
		const envelope: SessionUpdateEnvelope = {
			seq: session.seq,
			sessionId,
			ts: this.nextTs(),
			frame,
		};
		session.journal.push(envelope);
		for (const subscriber of [...session.subscribers]) {
			subscriber(envelope);
		}
		return envelope;
	}

	emitUpdate(sessionId: string, update: SessionUpdate) {
		this.journalFrame(sessionId, { kind: "update", update });
	}

	emitState(sessionId: string, overrides: Partial<SessionScopedState> = {}) {
		const session = this.require(sessionId);
		session.state = {
			...session.state,
			...overrides,
			updatedAt: this.nextTs(),
		};
		this.journalFrame(sessionId, {
			kind: "state",
			state: { ...session.state },
		});
	}

	requestPermission(
		sessionId: string,
		nativeRequestId: string,
		toolCallId: string,
	) {
		const session = this.require(sessionId);
		session.pendingPermissionIds.add(nativeRequestId);
		this.journalFrame(sessionId, {
			kind: "permission_requested",
			pending: {
				requestId: nativeRequestId,
				toolCall: { toolCallId },
				options: [
					{ optionId: "allow", name: "Allow", kind: "allow_once" },
					{ optionId: "reject", name: "Reject", kind: "reject_once" },
				],
				requestedAt: this.nextTs(),
			},
		});
	}

	completeTurn(sessionId: string, stopReason: AcpStopReason) {
		this.emitState(sessionId, { status: "idle", lastStopReason: stopReason });
	}

	/**
	 * Ring-buffer eviction: drop all but the newest `keepLast` envelopes. A
	 * later subscribe from an evicted seq gets one reset frame, like the real
	 * SessionJournal.
	 */
	evictJournal(sessionId: string, keepLast = 0) {
		const session = this.require(sessionId);
		session.journal = keepLast > 0 ? session.journal.slice(-keepLast) : [];
	}

	// ---- AcpSessionsPort ------------------------------------------------

	async create(input: { sessionId: string; workspaceId: string }) {
		this.createCalls += 1;
		const existing = this.sessions.get(input.sessionId);
		if (existing) return { ...existing.state };
		const session = this.seed(input.sessionId, {
			workspaceId: input.workspaceId,
		});
		this.journalFrame(input.sessionId, {
			kind: "state",
			state: { ...session.state },
		});
		return { ...session.state };
	}

	get(sessionId: string): SessionScopedState {
		return { ...this.require(sessionId).state };
	}

	async ensureLive(sessionId: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session || session.state.status !== "offline") return;
		// A resurrection loads the transcript into a brand-new journal.
		session.journal = [];
		session.seq = 0;
		session.subscribers.clear();
		session.state = { ...session.state, status: "idle" };
		this.journalFrame(sessionId, {
			kind: "state",
			state: { ...session.state },
		});
		for (const frame of session.resurrectFrames) {
			this.journalFrame(sessionId, frame);
		}
	}

	list(input: { workspaceId?: string; cursor?: string; limit?: number }) {
		const limit = input.limit ?? 50;
		const states = [...this.sessions.values()]
			.map((session) => ({ ...session.state }))
			.filter(
				(state) =>
					!input.workspaceId || state.workspaceId === input.workspaceId,
			)
			.sort(
				(a, b) =>
					b.createdAt - a.createdAt || a.sessionId.localeCompare(b.sessionId),
			);
		let start = 0;
		if (input.cursor) {
			const separator = input.cursor.indexOf(":");
			const createdAt = Number(input.cursor.slice(0, separator));
			const sessionId = input.cursor.slice(separator + 1);
			start = states.findIndex(
				(state) =>
					state.createdAt < createdAt ||
					(state.createdAt === createdAt &&
						state.sessionId.localeCompare(sessionId) > 0),
			);
			if (start === -1) start = states.length;
		}
		const page = states.slice(start, start + limit);
		const last = page[page.length - 1];
		return {
			items: page,
			nextCursor:
				last && start + limit < states.length
					? `${last.createdAt}:${last.sessionId}`
					: null,
		};
	}

	prompt(input: { sessionId: string; prompt: AcpContentBlock[] }) {
		this.promptCalls += 1;
		const session = this.requireLive(input.sessionId);
		for (const block of input.prompt) {
			this.journalFrame(input.sessionId, {
				kind: "update",
				update: { sessionUpdate: "user_message_chunk", content: block },
			});
		}
		session.state.lastError = null;
		this.emitState(input.sessionId, { status: "running" });
		return {
			accepted: true as const,
			turn: Promise.resolve({ stopReason: "end_turn" as const }),
		};
	}

	respondToPermission(input: {
		sessionId: string;
		requestId: string;
		outcome: RequestPermissionOutcome;
	}) {
		const session = this.requireLive(input.sessionId);
		this.respondCalls.push({
			requestId: input.requestId,
			outcome: input.outcome,
		});
		if (!session.pendingPermissionIds.delete(input.requestId)) {
			return { status: "already_resolved" as const };
		}
		this.journalFrame(input.sessionId, {
			kind: "permission_resolved",
			requestId: input.requestId,
			outcome: input.outcome,
		});
		return { status: "resolved" as const };
	}

	async cancel(input: { sessionId: string }): Promise<void> {
		this.cancelCalls += 1;
		const session = this.requireLive(input.sessionId);
		for (const requestId of [...session.pendingPermissionIds]) {
			this.respondToPermission({
				sessionId: input.sessionId,
				requestId,
				outcome: { outcome: "cancelled" },
			});
		}
		this.emitState(input.sessionId, {
			status: "idle",
			lastStopReason: "cancelled",
		});
	}

	async setMode(input: { sessionId: string; modeId: string }): Promise<void> {
		const session = this.requireLive(input.sessionId);
		if (session.state.currentMode) {
			session.state.currentMode = {
				...session.state.currentMode,
				currentModeId: input.modeId,
			};
		}
		this.emitState(input.sessionId, {});
	}

	async setConfigOption(input: {
		sessionId: string;
		configId: string;
		value: string | boolean;
	}): Promise<void> {
		const session = this.requireLive(input.sessionId);
		const options = session.state.configOptions.map((option) =>
			option.id === input.configId
				? ({ ...option, currentValue: input.value } as SessionConfigOption)
				: option,
		);
		if (!options.some((option) => option.id === input.configId)) {
			throw new Error(`Unknown config option: ${input.configId}`);
		}
		session.state = { ...session.state, configOptions: options };
		this.emitState(input.sessionId, {});
	}

	subscribe(input: {
		sessionId: string;
		since?: number;
		onEnvelope: (envelope: SessionUpdateEnvelope) => void;
	}): () => void {
		const session = this.require(input.sessionId);
		const since = input.since ?? session.seq;
		// Mirror SessionJournal.after: a since older than the retained tail OR
		// ahead of the journal head (a cursor from before a resurrection reset
		// seqs) is unservable — one reset frame, never attaches.
		const oldest = session.journal[0]?.seq ?? session.seq + 1;
		if (since > session.seq || (since < session.seq && since < oldest - 1)) {
			input.onEnvelope({
				seq: 0,
				sessionId: input.sessionId,
				ts: this.nextTs(),
				frame: { kind: "reset", reason: "journal evicted" },
			});
			return () => {};
		}
		for (const envelope of session.journal) {
			if (envelope.seq > since) input.onEnvelope(envelope);
		}
		session.subscribers.add(input.onEnvelope);
		return () => {
			session.subscribers.delete(input.onEnvelope);
		};
	}
}

/** Runtime with an injected deterministic clock and session-id mint. */
export function makeRuntime(port: FakeAcpPort) {
	let mintSerial = 0;
	let clock = T0 + 500_000;
	return new CanonicalSessionsRuntime({
		port,
		now: () => {
			clock += 1;
			return clock;
		},
		mintSessionId: () => {
			mintSerial += 1;
			return `session-minted-${mintSerial}`;
		},
	});
}
