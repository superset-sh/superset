import { beforeEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import type { WorkspaceStreamEvent } from "./workspace-stream-bus";
import { WorkspaceStreamBus } from "./workspace-stream-bus";

class FakeTerminal extends EventEmitter {
	capabilities = { persistent: true, coldRestore: true };
	management = {
		listSessions: async () => ({ sessions: [] }),
		killAllSessions: async () => {},
		resetHistoryPersistence: async () => {},
	};
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
	let terminal: FakeTerminal;

	beforeEach(() => {
		bus = new WorkspaceStreamBus();
		terminal = new FakeTerminal();
		bus.attach(terminal as never);
	});

	it("increments eventId monotonically per workspace", () => {
		bus.registerPane("pane-1", "ws-1");
		bus.registerPane("pane-2", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		terminal.emit("data:pane-1", "hello");
		terminal.emit("data:pane-2", "world");

		// First event is watermark, then two data events
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

		terminal.emit("data:pane-1", "a");
		terminal.emit("data:pane-2", "b");
		terminal.emit("data:pane-1", "c");

		const dataEvents = events.filter(
			(e) => e.type === "terminal.data",
		) as Array<Extract<WorkspaceStreamEvent, { type: "terminal.data" }>>;
		expect(dataEvents).toHaveLength(3);
		// pane-1 should have sessionSeq 1 and 2
		const pane1Events = dataEvents.filter((e) => e.paneId === "pane-1");
		expect(pane1Events[0].sessionSeq).toBe(1);
		expect(pane1Events[1].sessionSeq).toBe(2);
		// pane-2 should have sessionSeq 1
		const pane2Events = dataEvents.filter((e) => e.paneId === "pane-2");
		expect(pane2Events[0].sessionSeq).toBe(1);
	});

	it("emits watermark first on subscribe", () => {
		bus.registerPane("pane-1", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("terminal.watermark");
	});

	it("subscription stays alive across terminal.exit", () => {
		bus.registerPane("pane-1", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		terminal.emit("exit:pane-1", 0, undefined, "exited");
		terminal.emit("data:pane-1", "after-exit");

		const types = events.map((e) => e.type);
		expect(types).toContain("terminal.exit");
		expect(types).toContain("terminal.data");
	});

	it("replays correct slice for sinceEventId", () => {
		bus.registerPane("pane-1", "ws-1");

		// Push some events before subscribing
		terminal.emit("data:pane-1", "a");
		terminal.emit("data:pane-1", "b");
		terminal.emit("data:pane-1", "c");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e), 1);

		// Should get watermark + events with eventId > 1 (i.e., eventId 2 and 3)
		const dataEvents = events.filter((e) => e.type === "terminal.data");
		expect(dataEvents).toHaveLength(2);
	});

	it("unsubscribe removes listener and does not leak", () => {
		bus.registerPane("pane-1", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		const unsub = bus.subscribe("ws-1", (e) => events.push(e));

		terminal.emit("data:pane-1", "before");
		unsub();
		terminal.emit("data:pane-1", "after");

		const dataEvents = events.filter((e) => e.type === "terminal.data");
		expect(dataEvents).toHaveLength(1);
	});

	it("two sessions in same workspace interleave safely", () => {
		bus.registerPane("pane-1", "ws-1");
		bus.registerPane("pane-2", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		terminal.emit("data:pane-1", "x");
		terminal.emit("data:pane-2", "y");
		terminal.emit("data:pane-1", "z");
		terminal.emit("data:pane-2", "w");

		const dataEvents = events.filter(
			(e) => e.type === "terminal.data",
		) as Array<Extract<WorkspaceStreamEvent, { type: "terminal.data" }>>;
		// eventIds should be strictly increasing
		for (let i = 1; i < dataEvents.length; i++) {
			expect(dataEvents[i].eventId).toBeGreaterThan(dataEvents[i - 1].eventId);
		}
		// sessionSeqs per pane should be increasing
		const pane1Seqs = dataEvents
			.filter((e) => e.paneId === "pane-1")
			.map((e) => e.sessionSeq);
		expect(pane1Seqs).toEqual([1, 2]);
		const pane2Seqs = dataEvents
			.filter((e) => e.paneId === "pane-2")
			.map((e) => e.sessionSeq);
		expect(pane2Seqs).toEqual([1, 2]);
	});

	it("ignores events from unregistered panes", () => {
		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		terminal.emit("data:unknown-pane", "hello");

		// Only watermark, no data event
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

		terminal.emit("data:pane-1", "for-ws-1");
		terminal.emit("data:pane-2", "for-ws-2");

		const ws1Data = ws1Events.filter((e) => e.type === "terminal.data");
		const ws2Data = ws2Events.filter((e) => e.type === "terminal.data");
		expect(ws1Data).toHaveLength(1);
		expect(ws2Data).toHaveLength(1);
	});

	it("handles exit event with correct fields", () => {
		bus.registerPane("pane-1", "ws-1");

		const events: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", (e) => events.push(e));

		terminal.emit("exit:pane-1", 137, 9, "killed");

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

		terminal.emit("error:pane-1", {
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

	it("listener error does not crash bus", () => {
		bus.registerPane("pane-1", "ws-1");

		const goodEvents: WorkspaceStreamEvent[] = [];
		bus.subscribe("ws-1", () => {
			throw new Error("bad listener");
		});
		bus.subscribe("ws-1", (e) => goodEvents.push(e));

		terminal.emit("data:pane-1", "test");

		const dataEvents = goodEvents.filter((e) => e.type === "terminal.data");
		expect(dataEvents).toHaveLength(1);
	});
});
