import { beforeEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import type { WorkspaceStreamEvent } from "./workspace-stream-bus";
import { WorkspaceStreamBus } from "./workspace-stream-bus";

// ---------------------------------------------------------------------------
// Minimal fake that extends EventEmitter — mirrors DaemonTerminalManager
// ---------------------------------------------------------------------------
class FakeBackend extends EventEmitter {
	emitData(paneId: string, data: string) {
		this.emit(`data:${paneId}`, data);
	}
	emitExit(
		paneId: string,
		exitCode: number,
		signal?: number,
		reason?: "killed" | "exited" | "error",
	) {
		this.emit(`exit:${paneId}`, exitCode, signal, reason);
	}
	emitDisconnect(paneId: string, reason: string) {
		this.emit(`disconnect:${paneId}`, reason);
	}
	emitError(paneId: string, payload: { error: string; code?: string }) {
		this.emit(`error:${paneId}`, payload);
	}
}

// ---------------------------------------------------------------------------
// Adapter that delegates on/off/emit to a backend — mirrors LocalTerminalRuntime
// ---------------------------------------------------------------------------
class FakeRuntimeAdapter {
	capabilities = { persistent: true, coldRestore: true };
	management = {
		listSessions: async () => ({ sessions: [] }),
		killAllSessions: async () => {},
		resetHistoryPersistence: async () => {},
	};
	constructor(private backend: FakeBackend) {}
	on(event: string | symbol, listener: (...args: unknown[]) => void) {
		this.backend.on(event, listener);
		return this;
	}
	off(event: string | symbol, listener: (...args: unknown[]) => void) {
		this.backend.off(event, listener);
		return this;
	}
	emit(event: string | symbol, ...args: unknown[]) {
		return this.backend.emit(event, ...args);
	}
	async createOrAttach() {
		return {} as never;
	}
	write() {}
	resize() {}
	signal() {}
	async kill() {}
	detach() {}
	clearScrollback() {}
	ackColdRestore() {}
	getSession() {
		return null;
	}
	async killByWorkspaceId() {
		return { killed: 0, failed: 0 };
	}
	async getSessionCountByWorkspaceId() {
		return 0;
	}
	refreshPromptsForWorkspace() {}
	detachAllListeners() {}
	async cleanup() {}
}

describe("WorkspaceStreamBus", () => {
	let bus: WorkspaceStreamBus;
	let backend: FakeBackend;
	let adapter: FakeRuntimeAdapter;

	beforeEach(() => {
		bus = new WorkspaceStreamBus();
		backend = new FakeBackend();
		adapter = new FakeRuntimeAdapter(backend);
		bus.attach(adapter as never);
	});

	// -----------------------------------------------------------------------
	// Issue #1: events emitted internally by the backend must reach the bus
	// -----------------------------------------------------------------------
	it("receives events emitted directly on the backend (not through adapter emit)", () => {
		bus.registerPane("pane-1", "ws-1");
		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		// Emit directly on backend — this is what DaemonTerminalManager does
		backend.emitData("pane-1", "hello from backend");

		const dataEvents = events.filter((e) => e.type === "terminal.data");
		expect(dataEvents).toHaveLength(1);
		if (dataEvents[0].type === "terminal.data") {
			expect(dataEvents[0].data).toBe("hello from backend");
		}
	});

	it("does NOT require events to pass through the adapter emit method", () => {
		bus.registerPane("pane-1", "ws-1");
		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		// Call backend.emit directly — simulates internal this.emit() in DaemonTerminalManager
		backend.emit("data:pane-1", "direct emit");

		const dataEvents = events.filter((e) => e.type === "terminal.data");
		expect(dataEvents).toHaveLength(1);
	});

	// -----------------------------------------------------------------------
	// Event ordering
	// -----------------------------------------------------------------------
	it("increments eventId monotonically per workspace", () => {
		bus.registerPane("pane-1", "ws-1");
		bus.registerPane("pane-2", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		backend.emitData("pane-1", "hello");
		backend.emitData("pane-2", "world");

		const dataEvents = events.filter((e) => e.type === "terminal.data");
		expect(dataEvents).toHaveLength(2);
		expect(dataEvents[0].eventId).toBe(1);
		expect(dataEvents[1].eventId).toBe(2);
	});

	it("increments sessionSeq monotonically per session", () => {
		bus.registerPane("pane-1", "ws-1");
		bus.registerPane("pane-2", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		backend.emitData("pane-1", "a");
		backend.emitData("pane-2", "b");
		backend.emitData("pane-1", "c");

		const dataEvents = events.filter(
			(e) => e.type === "terminal.data",
		) as Array<Extract<WorkspaceStreamEvent, { type: "terminal.data" }>>;
		expect(dataEvents).toHaveLength(3);
		const pane1Events = dataEvents.filter((e) => e.paneId === "pane-1");
		expect(pane1Events[0].sessionSeq).toBe(1);
		expect(pane1Events[1].sessionSeq).toBe(2);
		const pane2Events = dataEvents.filter((e) => e.paneId === "pane-2");
		expect(pane2Events[0].sessionSeq).toBe(1);
	});

	// -----------------------------------------------------------------------
	// Watermark
	// -----------------------------------------------------------------------
	it("emits watermark first on subscribe", () => {
		bus.registerPane("pane-1", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("terminal.watermark");
	});

	// -----------------------------------------------------------------------
	// Subscription lifecycle
	// -----------------------------------------------------------------------
	it("subscription stays alive across terminal.exit", () => {
		bus.registerPane("pane-1", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		backend.emitExit("pane-1", 0, undefined, "exited");
		backend.emitData("pane-1", "after-exit");

		const types = events.map((e) => e.type);
		expect(types).toContain("terminal.exit");
		expect(types).toContain("terminal.data");
	});

	it("unsubscribe removes listener and does not leak", () => {
		bus.registerPane("pane-1", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		const unsub = bus.subscribe("ws-1", (e) => events.push(e));

		backend.emitData("pane-1", "before");
		unsub();
		backend.emitData("pane-1", "after");

		const dataEvents = events.filter((e) => e.type === "terminal.data");
		expect(dataEvents).toHaveLength(1);
	});

	// -----------------------------------------------------------------------
	// Replay
	// -----------------------------------------------------------------------
	it("replays correct slice for sinceEventId", () => {
		bus.registerPane("pane-1", "ws-1");

		backend.emitData("pane-1", "a");
		backend.emitData("pane-1", "b");
		backend.emitData("pane-1", "c");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e), 1);

		// Should get watermark + events with eventId > 1 (eventId 2 and 3)
		const dataEvents = events.filter((e) => e.type === "terminal.data");
		expect(dataEvents).toHaveLength(2);
	});

	it("emits a single monotonic watermark when replay cursor is stale", () => {
		bus.registerPane("pane-1", "ws-1");

		backend.emitData("pane-1", "a");
		backend.emitData("pane-1", "b");
		backend.emitData("pane-1", "c");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e), -1_000);

		const watermarkEvents = events.filter(
			(e) => e.type === "terminal.watermark",
		) as Array<Extract<WorkspaceStreamEvent, { type: "terminal.watermark" }>>;
		expect(watermarkEvents).toHaveLength(1);
		expect(watermarkEvents[0].eventId).toBe(3);
	});

	// -----------------------------------------------------------------------
	// Multi-session interleaving
	// -----------------------------------------------------------------------
	it("two sessions in same workspace interleave safely", () => {
		bus.registerPane("pane-1", "ws-1");
		bus.registerPane("pane-2", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		backend.emitData("pane-1", "x");
		backend.emitData("pane-2", "y");
		backend.emitData("pane-1", "z");
		backend.emitData("pane-2", "w");

		const dataEvents = events.filter(
			(e) => e.type === "terminal.data",
		) as Array<Extract<WorkspaceStreamEvent, { type: "terminal.data" }>>;
		for (let i = 1; i < dataEvents.length; i++) {
			expect(dataEvents[i].eventId).toBeGreaterThan(dataEvents[i - 1].eventId);
		}
		const pane1Seqs = dataEvents
			.filter((e) => e.paneId === "pane-1")
			.map((e) => e.sessionSeq);
		expect(pane1Seqs).toEqual([1, 2]);
		const pane2Seqs = dataEvents
			.filter((e) => e.paneId === "pane-2")
			.map((e) => e.sessionSeq);
		expect(pane2Seqs).toEqual([1, 2]);
	});

	// -----------------------------------------------------------------------
	// Routing
	// -----------------------------------------------------------------------
	it("ignores events from unregistered panes", () => {
		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		backend.emitData("unknown-pane", "hello");

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("terminal.watermark");
	});

	it("routes events to correct workspace", () => {
		bus.registerPane("pane-1", "ws-1");
		bus.registerPane("pane-2", "ws-2");

		const ws1Events: WorkspaceStreamEvent[] = [];
		const ws2Events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => ws1Events.push(e));
		bus.subscribe("ws-2", (e) => ws2Events.push(e));

		backend.emitData("pane-1", "for-ws-1");
		backend.emitData("pane-2", "for-ws-2");

		const ws1Data = ws1Events.filter((e) => e.type === "terminal.data");
		const ws2Data = ws2Events.filter((e) => e.type === "terminal.data");
		expect(ws1Data).toHaveLength(1);
		expect(ws2Data).toHaveLength(1);
	});

	// -----------------------------------------------------------------------
	// Event field correctness
	// -----------------------------------------------------------------------
	it("handles exit event with correct fields", () => {
		bus.registerPane("pane-1", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		backend.emitExit("pane-1", 137, 9, "killed");

		const exitEvent = events.find((e) => e.type === "terminal.exit");
		expect(exitEvent).toBeDefined();
		if (exitEvent?.type === "terminal.exit") {
			expect(exitEvent.exitCode).toBe(137);
			expect(exitEvent.signal).toBe(9);
			expect(exitEvent.reason).toBe("killed");
		}
	});

	it("handles error event with correct fields", () => {
		bus.registerPane("pane-1", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		backend.emitError("pane-1", {
			error: "Something went wrong",
			code: "WRITE_FAILED",
		});

		const errorEvent = events.find((e) => e.type === "terminal.error");
		expect(errorEvent).toBeDefined();
		if (errorEvent?.type === "terminal.error") {
			expect(errorEvent.message).toBe("Something went wrong");
			expect(errorEvent.code).toBe("WRITE_FAILED");
		}
	});

	it("handles disconnect event with correct fields", () => {
		bus.registerPane("pane-1", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		backend.emitDisconnect("pane-1", "Connection lost");

		const disconnectEvent = events.find(
			(e) => e.type === "terminal.disconnect",
		);
		expect(disconnectEvent).toBeDefined();
		if (disconnectEvent?.type === "terminal.disconnect") {
			expect(disconnectEvent.reason).toBe("Connection lost");
		}
	});

	// -----------------------------------------------------------------------
	// Error isolation
	// -----------------------------------------------------------------------
	it("listener error does not crash bus", () => {
		bus.registerPane("pane-1", "ws-1");

		const goodEvents: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", () => {
			throw new Error("bad listener");
		});
		bus.subscribe("ws-1", (e) => goodEvents.push(e));

		backend.emitData("pane-1", "test");

		const dataEvents = goodEvents.filter((e) => e.type === "terminal.data");
		expect(dataEvents).toHaveLength(1);
	});

	// -----------------------------------------------------------------------
	// Issue #2: pane registration cleanup
	// -----------------------------------------------------------------------
	it("unregisterPane removes event listeners from terminal", () => {
		bus.registerPane("pane-1", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		backend.emitData("pane-1", "before");
		bus.unregisterPane("pane-1");
		backend.emitData("pane-1", "after");

		const dataEvents = events.filter((e) => e.type === "terminal.data");
		expect(dataEvents).toHaveLength(1);
		// Confirm no dangling listeners on the backend
		expect(backend.listenerCount("data:pane-1")).toBe(0);
		expect(backend.listenerCount("exit:pane-1")).toBe(0);
		expect(backend.listenerCount("disconnect:pane-1")).toBe(0);
		expect(backend.listenerCount("error:pane-1")).toBe(0);
	});

	it("re-registering pane to different workspace cleans up old listeners", () => {
		bus.registerPane("pane-1", "ws-1");

		const ws1Events: WorkspaceStreamEvent[] = [];
		const ws2Events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => ws1Events.push(e));
		bus.subscribe("ws-2", (e) => ws2Events.push(e));

		backend.emitData("pane-1", "for-ws-1");

		// Re-register to ws-2
		bus.registerPane("pane-1", "ws-2");
		backend.emitData("pane-1", "for-ws-2");

		const ws1Data = ws1Events.filter((e) => e.type === "terminal.data");
		const ws2Data = ws2Events.filter((e) => e.type === "terminal.data");
		expect(ws1Data).toHaveLength(1);
		expect(ws2Data).toHaveLength(1);
		// Only one set of listeners should remain
		expect(backend.listenerCount("data:pane-1")).toBe(1);
	});

	it("registerPane is idempotent for same workspace", () => {
		bus.registerPane("pane-1", "ws-1");
		bus.registerPane("pane-1", "ws-1"); // duplicate

		// Should only have 1 set of listeners, not 2
		expect(backend.listenerCount("data:pane-1")).toBe(1);
	});

	it("wires listeners when panes are registered before attach", () => {
		const unboundBus = new WorkspaceStreamBus();
		const unboundBackend = new FakeBackend();
		const unboundAdapter = new FakeRuntimeAdapter(unboundBackend);

		unboundBus.registerPane("pane-1", "ws-1");
		unboundBus.attach(unboundAdapter as never);

		const events: WorkspaceStreamEvent[] = [];
		unboundBus.subscribe("ws-1", (e) => events.push(e));
		unboundBackend.emitData("pane-1", "late-attach");

		const dataEvents = events.filter((e) => e.type === "terminal.data");
		expect(dataEvents).toHaveLength(1);
	});

	it("reattaching to a new runtime detaches old listeners", () => {
		bus.registerPane("pane-1", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		const newBackend = new FakeBackend();
		const newAdapter = new FakeRuntimeAdapter(newBackend);
		bus.attach(newAdapter as never);

		backend.emitData("pane-1", "from-old-runtime");
		newBackend.emitData("pane-1", "from-new-runtime");

		const dataEvents = events.filter(
			(e) => e.type === "terminal.data",
		) as Array<Extract<WorkspaceStreamEvent, { type: "terminal.data" }>>;
		expect(dataEvents).toHaveLength(1);
		expect(dataEvents[0].data).toBe("from-new-runtime");
		expect(backend.listenerCount("data:pane-1")).toBe(0);
		expect(newBackend.listenerCount("data:pane-1")).toBe(1);
	});
});
