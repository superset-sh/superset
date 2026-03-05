import type { TerminalRuntime } from "../workspace-runtime/types";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

interface WorkspaceStreamEventBase {
	workspaceId: string;
	sessionId: string;
	paneId: string;
	eventId: number;
	sessionSeq: number;
	ts: number;
}

export interface TerminalDataEvent extends WorkspaceStreamEventBase {
	type: "terminal.data";
	data: string;
}

export interface TerminalExitEvent extends WorkspaceStreamEventBase {
	type: "terminal.exit";
	exitCode: number;
	signal?: number;
	reason?: "killed" | "exited" | "error";
}

export interface TerminalErrorEvent extends WorkspaceStreamEventBase {
	type: "terminal.error";
	code?: string;
	message: string;
}

export interface TerminalDisconnectEvent extends WorkspaceStreamEventBase {
	type: "terminal.disconnect";
	reason: string;
}

export interface TerminalWatermarkEvent {
	type: "terminal.watermark";
	workspaceId: string;
	eventId: number;
	ts: number;
}

export type WorkspaceStreamEvent =
	| TerminalDataEvent
	| TerminalExitEvent
	| TerminalErrorEvent
	| TerminalDisconnectEvent
	| TerminalWatermarkEvent;

// ---------------------------------------------------------------------------
// Ring buffer
// ---------------------------------------------------------------------------

const DEFAULT_MAX_EVENTS = 5_000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024; // 4 MiB
const DEFAULT_MAX_AGE_MS = 120_000;

interface RingBufferOptions {
	maxEvents?: number;
	maxBytes?: number;
	maxAgeMs?: number;
}

class EventRingBuffer {
	private events: WorkspaceStreamEvent[] = [];
	private totalBytes = 0;
	private maxEvents: number;
	private maxBytes: number;
	private maxAgeMs: number;

	constructor(opts?: RingBufferOptions) {
		this.maxEvents = opts?.maxEvents ?? DEFAULT_MAX_EVENTS;
		this.maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
		this.maxAgeMs = opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
	}

	push(event: WorkspaceStreamEvent): void {
		const size = this.estimateBytes(event);
		this.events.push(event);
		this.totalBytes += size;
		this.evict();
	}

	replaySince(sinceEventId: number): WorkspaceStreamEvent[] {
		this.evictStale();
		const idx = this.events.findIndex((e) => {
			const eid = "eventId" in e ? e.eventId : -1;
			return eid > sinceEventId;
		});
		if (idx === -1) return [];
		return this.events.slice(idx);
	}

	oldestEventId(): number | null {
		this.evictStale();
		if (this.events.length === 0) return null;
		const first = this.events[0];
		return "eventId" in first ? first.eventId : null;
	}

	latestEventId(): number {
		if (this.events.length === 0) return 0;
		const last = this.events[this.events.length - 1];
		return "eventId" in last ? last.eventId : 0;
	}

	clear(): void {
		this.events = [];
		this.totalBytes = 0;
	}

	private evict(): void {
		while (
			this.events.length > this.maxEvents ||
			this.totalBytes > this.maxBytes
		) {
			const removed = this.events.shift();
			if (removed) {
				this.totalBytes -= this.estimateBytes(removed);
			}
		}
		this.evictStale();
	}

	private evictStale(): void {
		const cutoff = Date.now() - this.maxAgeMs;
		while (this.events.length > 0) {
			const first = this.events[0];
			const ts = "ts" in first ? first.ts : 0;
			if (ts >= cutoff) break;
			const removed = this.events.shift();
			if (removed) {
				this.totalBytes -= this.estimateBytes(removed);
			}
		}
	}

	private estimateBytes(event: WorkspaceStreamEvent): number {
		if (event.type === "terminal.data") {
			return event.data.length * 2 + 200; // rough estimate
		}
		return 200;
	}
}

// ---------------------------------------------------------------------------
// Workspace stream state
// ---------------------------------------------------------------------------

type Listener = (event: WorkspaceStreamEvent) => void;

interface WorkspaceState {
	nextEventId: number;
	sessionSeqCounters: Map<string, number>;
	buffer: EventRingBuffer;
	listeners: Set<Listener>;
}

// ---------------------------------------------------------------------------
// WorkspaceStreamBus
// ---------------------------------------------------------------------------

export class WorkspaceStreamBus {
	private workspaces = new Map<string, WorkspaceState>();
	private paneToWorkspace = new Map<string, string>();
	private attached = false;

	attach(terminal: TerminalRuntime): void {
		if (this.attached) return;
		this.attached = true;

		const originalEmit = terminal.emit.bind(terminal);
		terminal.emit = (event: string | symbol, ...args: unknown[]): boolean => {
			if (typeof event === "string") {
				this.interceptEmit(event, args);
			}
			return originalEmit(event, ...args);
		};
	}

	registerPane(paneId: string, workspaceId: string): void {
		this.paneToWorkspace.set(paneId, workspaceId);
	}

	unregisterPane(paneId: string): void {
		this.paneToWorkspace.delete(paneId);
	}

	subscribe(
		workspaceId: string,
		listener: Listener,
		sinceEventId?: number,
	): () => void {
		const ws = this.getOrCreateWorkspace(workspaceId);
		ws.listeners.add(listener);

		// Emit initial watermark
		const watermark: TerminalWatermarkEvent = {
			type: "terminal.watermark",
			workspaceId,
			eventId: ws.buffer.latestEventId(),
			ts: Date.now(),
		};
		this.safeCall(listener, watermark);

		// Replay if requested
		if (sinceEventId != null) {
			const replayed = ws.buffer.replaySince(sinceEventId);
			const oldest = ws.buffer.oldestEventId();
			if (oldest !== null && sinceEventId < oldest) {
				// sinceEventId is older than retention — emit fresh watermark
				this.safeCall(listener, {
					type: "terminal.watermark",
					workspaceId,
					eventId: oldest,
					ts: Date.now(),
				});
			}
			for (const event of replayed) {
				this.safeCall(listener, event);
			}
		}

		return () => {
			ws.listeners.delete(listener);
		};
	}

	dispose(): void {
		for (const ws of this.workspaces.values()) {
			ws.listeners.clear();
			ws.buffer.clear();
		}
		this.workspaces.clear();
		this.paneToWorkspace.clear();
		this.attached = false;
	}

	// -----------------------------------------------------------------------
	// Internals
	// -----------------------------------------------------------------------

	private interceptEmit(event: string, args: unknown[]): void {
		const colonIdx = event.indexOf(":");
		if (colonIdx === -1) return;

		const type = event.slice(0, colonIdx);
		const paneId = event.slice(colonIdx + 1);
		const workspaceId = this.paneToWorkspace.get(paneId);
		if (!workspaceId) return;

		switch (type) {
			case "data":
				this.pushData(workspaceId, paneId, args[0] as string);
				break;
			case "exit":
				this.pushExit(
					workspaceId,
					paneId,
					args[0] as number,
					args[1] as number | undefined,
					args[2] as "killed" | "exited" | "error" | undefined,
				);
				break;
			case "disconnect":
				this.pushDisconnect(workspaceId, paneId, args[0] as string);
				break;
			case "error":
				this.pushError(
					workspaceId,
					paneId,
					args[0] as { error: string; code?: string },
				);
				break;
		}
	}

	private pushData(workspaceId: string, paneId: string, data: string): void {
		const ws = this.getOrCreateWorkspace(workspaceId);
		const event: TerminalDataEvent = {
			type: "terminal.data",
			workspaceId,
			sessionId: paneId,
			paneId,
			eventId: ws.nextEventId++,
			sessionSeq: this.nextSessionSeq(ws, paneId),
			ts: Date.now(),
			data,
		};
		this.emit(ws, event);
	}

	private pushExit(
		workspaceId: string,
		paneId: string,
		exitCode: number,
		signal?: number,
		reason?: "killed" | "exited" | "error",
	): void {
		const ws = this.getOrCreateWorkspace(workspaceId);
		const event: TerminalExitEvent = {
			type: "terminal.exit",
			workspaceId,
			sessionId: paneId,
			paneId,
			eventId: ws.nextEventId++,
			sessionSeq: this.nextSessionSeq(ws, paneId),
			ts: Date.now(),
			exitCode,
			signal,
			reason,
		};
		this.emit(ws, event);
	}

	private pushDisconnect(
		workspaceId: string,
		paneId: string,
		reason: string,
	): void {
		const ws = this.getOrCreateWorkspace(workspaceId);
		const event: TerminalDisconnectEvent = {
			type: "terminal.disconnect",
			workspaceId,
			sessionId: paneId,
			paneId,
			eventId: ws.nextEventId++,
			sessionSeq: this.nextSessionSeq(ws, paneId),
			ts: Date.now(),
			reason,
		};
		this.emit(ws, event);
	}

	private pushError(
		workspaceId: string,
		paneId: string,
		payload: { error: string; code?: string },
	): void {
		const ws = this.getOrCreateWorkspace(workspaceId);
		const event: TerminalErrorEvent = {
			type: "terminal.error",
			workspaceId,
			sessionId: paneId,
			paneId,
			eventId: ws.nextEventId++,
			sessionSeq: this.nextSessionSeq(ws, paneId),
			ts: Date.now(),
			message: payload.error,
			code: payload.code,
		};
		this.emit(ws, event);
	}

	private emit(ws: WorkspaceState, event: WorkspaceStreamEvent): void {
		ws.buffer.push(event);
		for (const listener of ws.listeners) {
			this.safeCall(listener, event);
		}
	}

	private safeCall(listener: Listener, event: WorkspaceStreamEvent): void {
		try {
			listener(event);
		} catch (err) {
			console.error("[WorkspaceStreamBus] Listener error:", err);
		}
	}

	private getOrCreateWorkspace(workspaceId: string): WorkspaceState {
		let ws = this.workspaces.get(workspaceId);
		if (!ws) {
			ws = {
				nextEventId: 1,
				sessionSeqCounters: new Map(),
				buffer: new EventRingBuffer(),
				listeners: new Set(),
			};
			this.workspaces.set(workspaceId, ws);
		}
		return ws;
	}

	private nextSessionSeq(ws: WorkspaceState, sessionId: string): number {
		const current = ws.sessionSeqCounters.get(sessionId) ?? 0;
		const next = current + 1;
		ws.sessionSeqCounters.set(sessionId, next);
		return next;
	}
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: WorkspaceStreamBus | null = null;

export function getWorkspaceStreamBus(): WorkspaceStreamBus {
	if (!instance) {
		instance = new WorkspaceStreamBus();
	}
	return instance;
}

export function disposeWorkspaceStreamBus(): void {
	instance?.dispose();
	instance = null;
}
