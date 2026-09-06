import { beforeEach, describe, expect, it } from "bun:test";
import {
	type TerminalAgentBindingPersistence,
	TerminalAgentStore,
} from "./store";
import type { TerminalAgentBinding } from "./types";

const WORKSPACE = "ws-1";

describe("TerminalAgentStore", () => {
	let store: TerminalAgentStore;

	beforeEach(() => {
		store = new TerminalAgentStore();
	});

	it("creates a binding on first event and exposes it via get/list/findActive", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			agentSessionId: "s1",
			occurredAt: 100,
		});

		const binding = store.get("t1");
		expect(binding).toBeDefined();
		expect(binding?.terminalId).toBe("t1");
		expect(binding?.agentId).toBe("claude");
		expect(binding?.agentSessionId).toBe("s1");
		expect(binding?.startedAt).toBe(100);
		expect(binding?.lastEventAt).toBe(100);

		expect(store.listByWorkspace(WORKSPACE)).toHaveLength(1);
		expect(store.findActive(WORKSPACE, "claude")?.terminalId).toBe("t1");
	});

	it("updates lastEventAt/lastEventType on intermediate events without resetting startedAt", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			occurredAt: 100,
		});
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Start",
			occurredAt: 200,
		});

		const binding = store.get("t1");
		expect(binding?.startedAt).toBe(100);
		expect(binding?.lastEventAt).toBe(200);
		expect(binding?.lastEventType).toBe("Start");
		expect(binding?.agentId).toBe("claude");
	});

	it("Attached refreshes the binding without downgrading an active working state", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Start",
			agentId: "codex",
			agentSessionId: "s1",
			occurredAt: 100,
		});
		// The wrapper's launch report is delayed and can land after the first
		// prompt already marked the agent working; it must not flip the
		// working indicator back to idle.
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "codex",
			occurredAt: 200,
		});

		const binding = store.get("t1");
		expect(binding?.lastEventType).toBe("Start");
		expect(binding?.lastEventAt).toBe(200);
		expect(binding?.agentSessionId).toBe("s1");
	});

	it("Attached preserves every same-session lifecycle state, not just working ones", () => {
		// Stop must survive: an Attached lastEventType would erase the row's
		// resume-candidate status; Failed must survive so the failure stays
		// surfaced.
		for (const [i, lastEventType] of [
			"PermissionRequest",
			"Stop",
			"Failed",
		].entries()) {
			const terminalId = `t-preserve-${i}`;
			store.recordEvent({
				terminalId,
				workspaceId: WORKSPACE,
				eventType: lastEventType,
				agentId: "codex",
				agentSessionId: "s1",
				occurredAt: 100,
			});
			store.recordEvent({
				terminalId,
				workspaceId: WORKSPACE,
				eventType: "Attached",
				agentId: "codex",
				agentSessionId: "s1",
				occurredAt: 200,
			});

			expect(store.get(terminalId)?.lastEventType).toBe(lastEventType);
			expect(store.get(terminalId)?.lastEventAt).toBe(200);
		}
	});

	it("Attached with a new session id overrides the previous session's working state", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Start",
			agentId: "codex",
			agentSessionId: "s1",
			occurredAt: 100,
		});
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "codex",
			agentSessionId: "s2",
			occurredAt: 200,
		});

		const binding = store.get("t1");
		expect(binding?.lastEventType).toBe("Attached");
		expect(binding?.agentSessionId).toBe("s2");
		expect(binding?.startedAt).toBe(200);
	});

	it("deletes the binding on Detached/exit/error", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			occurredAt: 100,
		});
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Detached",
			occurredAt: 200,
		});

		expect(store.get("t1")).toBeUndefined();
		expect(store.listByWorkspace(WORKSPACE)).toHaveLength(0);
	});

	it("records a Failed event on the binding instead of deleting it", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			occurredAt: 100,
		});
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Failed",
			occurredAt: 200,
		});

		const binding = store.get("t1");
		expect(binding?.lastEventType).toBe("Failed");
		expect(binding?.lastEventAt).toBe(200);
		expect(store.listByWorkspace(WORKSPACE)).toHaveLength(1);
	});

	it("drops stale identity metadata on agent swap even when the new event omits it", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			agentSessionId: "s1",
			definitionId: "claude",
			occurredAt: 100,
		});
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "codex",
			occurredAt: 200,
		});

		const binding = store.get("t1");
		expect(binding?.agentId).toBe("codex");
		expect(binding?.agentSessionId).toBeUndefined();
		expect(binding?.definitionId).toBeUndefined();
		expect(binding?.startedAt).toBe(200);
	});

	it("overwrites the binding on agent swap inside the same terminal", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			agentSessionId: "s1",
			occurredAt: 100,
		});
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "codex",
			agentSessionId: "s2",
			occurredAt: 300,
		});

		const binding = store.get("t1");
		expect(binding?.agentId).toBe("codex");
		expect(binding?.agentSessionId).toBe("s2");
		expect(binding?.startedAt).toBe(300);
	});

	it("findActive tie-breaks on latest lastEventAt", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			occurredAt: 100,
		});
		store.recordEvent({
			terminalId: "t2",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			occurredAt: 200,
		});

		expect(store.findActive(WORKSPACE, "claude")?.terminalId).toBe("t2");

		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Start",
			occurredAt: 300,
		});
		expect(store.findActive(WORKSPACE, "claude")?.terminalId).toBe("t1");
	});

	it("markTerminalExited removes the binding", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			occurredAt: 100,
		});
		store.markTerminalExited("t1");
		expect(store.get("t1")).toBeUndefined();
	});

	it("emits 'change' with workspaceId on mutation", () => {
		const events: string[] = [];
		store.on("change", (workspaceId: string) => {
			events.push(workspaceId);
		});

		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			occurredAt: 100,
		});
		store.markTerminalExited("t1");

		expect(events).toEqual([WORKSPACE, WORKSPACE]);
	});

	it("clearWorkspaceStatuses forces non-Stop bindings to Stop, keeping lastEventAt", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Start",
			agentId: "claude",
			occurredAt: 100,
		});
		store.recordEvent({
			terminalId: "t2",
			workspaceId: "other",
			eventType: "Start",
			agentId: "claude",
			occurredAt: 200,
		});

		const events: string[] = [];
		store.on("change", (workspaceId: string) => {
			events.push(workspaceId);
		});

		store.clearWorkspaceStatuses(WORKSPACE);

		expect(store.get("t1")?.lastEventType).toBe("Stop");
		expect(store.get("t1")?.lastEventAt).toBe(100);
		expect(store.get("t2")?.lastEventType).toBe("Start");
		expect(events).toEqual([WORKSPACE]);

		// Everything already Stop → no-op, no change event.
		store.clearWorkspaceStatuses(WORKSPACE);
		expect(events).toEqual([WORKSPACE]);
	});

	it("clearWorkspaceStatuses scoped to a terminalId leaves siblings alone", () => {
		for (const terminalId of ["t1", "t2"]) {
			store.recordEvent({
				terminalId,
				workspaceId: WORKSPACE,
				eventType: "Start",
				agentId: "claude",
				occurredAt: 100,
			});
		}

		store.clearWorkspaceStatuses(WORKSPACE, "t1");

		expect(store.get("t1")?.lastEventType).toBe("Stop");
		expect(store.get("t2")?.lastEventType).toBe("Start");
	});

	it("filters listByWorkspace by agentId and definitionId", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			definitionId: "claude",
			occurredAt: 100,
		});
		store.recordEvent({
			terminalId: "t2",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "codex",
			definitionId: "codex",
			occurredAt: 200,
		});

		expect(
			store.listByWorkspace(WORKSPACE, { agentId: "claude" }),
		).toHaveLength(1);
		expect(
			store.listByWorkspace(WORKSPACE, { definitionId: "codex" }),
		).toHaveLength(1);
		expect(store.listByWorkspace("other")).toHaveLength(0);
	});

	it("ignores events with no agentId when no binding exists", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Start",
			occurredAt: 100,
		});
		expect(store.get("t1")).toBeUndefined();
	});

	it("lists bindings across all workspaces, preferring live persistence reads", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			occurredAt: 100,
		});
		store.recordEvent({
			terminalId: "t2",
			workspaceId: "ws-2",
			eventType: "Attached",
			agentId: "codex",
			occurredAt: 200,
		});

		expect(
			store
				.list()
				.map((binding) => binding.terminalId)
				.sort(),
		).toEqual(["t1", "t2"]);

		const live: TerminalAgentBinding = {
			terminalId: "t3",
			workspaceId: "ws-3",
			agentId: "claude",
			startedAt: 300,
			lastEventAt: 300,
			lastEventType: "Start",
		};
		const liveStore = new TerminalAgentStore({
			load: () => [],
			upsert: () => {},
			delete: () => {},
			listLive: () => [live],
		});
		expect(liveStore.list()).toEqual([live]);
	});

	it("hydrates persisted bindings", () => {
		const persisted: TerminalAgentBinding = {
			terminalId: "t1",
			workspaceId: WORKSPACE,
			agentId: "claude",
			agentSessionId: "s1",
			startedAt: 100,
			lastEventAt: 200,
			lastEventType: "Start",
		};

		const hydratedStore = new TerminalAgentStore({
			load: () => [persisted],
			upsert: () => {},
			delete: () => {},
		});

		expect(hydratedStore.get("t1")).toEqual(persisted);
		expect(hydratedStore.listByWorkspace(WORKSPACE)).toEqual([persisted]);
	});

	it("persists binding updates and deletes", () => {
		const persisted = new Map<string, TerminalAgentBinding>();
		const persistence: TerminalAgentBindingPersistence = {
			load: () => [],
			upsert: (binding) => {
				persisted.set(binding.terminalId, binding);
			},
			delete: (terminalId) => {
				persisted.delete(terminalId);
			},
		};
		const persistentStore = new TerminalAgentStore(persistence);

		persistentStore.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			occurredAt: 100,
		});
		expect(persisted.get("t1")?.lastEventType).toBe("Attached");

		persistentStore.markTerminalExited("t1");
		expect(persisted.has("t1")).toBe(false);
	});

	it("marks bindings ended instead of deleting when persistence supports it", () => {
		const persisted = new Map<string, TerminalAgentBinding>();
		const ended: Array<{ terminalId: string; reason: string }> = [];
		const persistence: TerminalAgentBindingPersistence = {
			load: () => [],
			upsert: (binding) => {
				persisted.set(binding.terminalId, binding);
			},
			delete: (terminalId) => {
				persisted.delete(terminalId);
			},
			markEnded: (terminalId, reason) => {
				const row = persisted.get(terminalId);
				if (!row) return undefined;
				ended.push({ terminalId, reason });
				return { workspaceId: row.workspaceId };
			},
		};
		const store = new TerminalAgentStore(persistence);

		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			agentSessionId: "sess-1",
			occurredAt: 100,
		});

		// The agent's own goodbye marks a clean detach; the row is retained.
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Detached",
			occurredAt: 200,
		});
		expect(store.get("t1")).toBeUndefined();
		expect(persisted.has("t1")).toBe(true);
		expect(ended).toEqual([{ terminalId: "t1", reason: "detached" }]);

		// A terminal-side kill marks the binding as a resume candidate.
		store.recordEvent({
			terminalId: "t2",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			occurredAt: 100,
		});
		store.markTerminalExited("t2");
		expect(persisted.has("t2")).toBe(true);
		expect(ended).toContainEqual({
			terminalId: "t2",
			reason: "terminal-exited",
		});
	});

	it("drops straggler events that would erase an ended row's resume state", () => {
		// Each scenario gets a fresh store so the straggler guard (which only
		// runs when no in-memory binding exists) is actually exercised.
		const scenario = () => {
			const persisted = new Map<string, TerminalAgentBinding>();
			const persistence: TerminalAgentBindingPersistence = {
				load: () => [],
				upsert: (binding) => {
					persisted.set(binding.terminalId, binding);
				},
				delete: (terminalId) => {
					persisted.delete(terminalId);
				},
				markEnded: () => undefined,
				getEnded: () => ({ endedAt: 100_000, agentSessionId: "sess-old" }),
			};
			return { persisted, store: new TerminalAgentStore(persistence) };
		};

		// Late Stop from the dead session (same session id, within window).
		const late = scenario();
		late.store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Stop",
			agentId: "codex",
			agentSessionId: "sess-old",
			occurredAt: 105_000,
		});
		expect(late.persisted.has("t1")).toBe(false);

		// Late event without a session id is equally untrusted.
		const anonymous = scenario();
		anonymous.store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Start",
			agentId: "codex",
			occurredAt: 110_000,
		});
		expect(anonymous.persisted.has("t1")).toBe(false);

		// An explicit new session start revives the row.
		const attached = scenario();
		attached.store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "codex",
			agentSessionId: "sess-new",
			occurredAt: 111_000,
		});
		expect(attached.persisted.get("t1")?.agentSessionId).toBe("sess-new");

		// A different session id is evidence of a new session even mid-window.
		const differentSession = scenario();
		differentSession.store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Stop",
			agentId: "codex",
			agentSessionId: "sess-other",
			occurredAt: 112_000,
		});
		expect(differentSession.persisted.get("t1")?.agentSessionId).toBe(
			"sess-other",
		);

		// Past the straggler window, events flow again (agents without
		// SessionStart hooks, e.g. vibe, must still bind).
		const lateArrival = scenario();
		lateArrival.store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Start",
			agentId: "vibe",
			occurredAt: 200_000,
		});
		expect(lateArrival.persisted.has("t1")).toBe(true);
	});
});

describe("TerminalAgentStore limit-stop signals", () => {
	let store: TerminalAgentStore;

	beforeEach(() => {
		store = new TerminalAgentStore();
	});

	function start(occurredAt: number) {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Start",
			agentId: "claude",
			occurredAt,
		});
	}

	it("records the error class of a Failed event beside lastEventType", () => {
		start(100);
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Failed",
			errorType: "rate_limit",
			occurredAt: 200,
		});

		const binding = store.get("t1");
		expect(binding?.lastEventType).toBe("Failed");
		expect(binding?.lastFailure).toEqual({ errorType: "rate_limit", at: 200 });
	});

	it("stamps the busy to stopped transition, and only on that move", () => {
		start(100);
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Stop",
			occurredAt: 200,
		});
		expect(store.get("t1")?.lastTransitionAt).toBe(200);

		// Stop after Stop is not a transition: the timestamp must not move.
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Stop",
			occurredAt: 300,
		});
		expect(store.get("t1")?.lastTransitionAt).toBe(200);

		// A permission request is busy, so the next Stop is a fresh transition.
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "PermissionRequest",
			occurredAt: 400,
		});
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Failed",
			occurredAt: 500,
		});
		expect(store.get("t1")?.lastTransitionAt).toBe(500);
	});

	// The transition dates the stop the engine is investigating, so it belongs
	// to the session it happened in — a new agent session in the same terminal
	// starts over, exactly as lastFailure does.
	it("drops the transition timestamp when a new agent session takes over", () => {
		start(100);
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Stop",
			occurredAt: 200,
		});
		expect(store.get("t1")?.lastTransitionAt).toBe(200);

		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Start",
			agentSessionId: "s2",
			occurredAt: 300,
		});
		expect(store.get("t1")?.lastTransitionAt).toBeUndefined();

		// The same session's own events still carry it forward.
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Stop",
			agentSessionId: "s2",
			occurredAt: 400,
		});
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Stop",
			agentSessionId: "s2",
			occurredAt: 500,
		});
		expect(store.get("t1")?.lastTransitionAt).toBe(400);
	});

	// The failure describes the turn it ended: the account engine reads it as
	// a limit-stop hint, so one carried past its turn would arm the fallback
	// against a live session.
	it("keeps the last failure until the session moves on, and never invents one", () => {
		start(100);
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Failed",
			errorType: "rate_limit",
			occurredAt: 200,
		});

		// A Failed without an error class leaves the previous one alone.
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Failed",
			occurredAt: 250,
		});
		// Neither does an event that is not turn progress.
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Notification",
			occurredAt: 275,
		});
		expect(store.get("t1")?.lastFailure).toEqual({
			errorType: "rate_limit",
			at: 200,
		});

		// A new turn drops it.
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Start",
			occurredAt: 300,
		});
		expect(store.get("t1")?.lastFailure).toBeUndefined();

		// So does a new agent session in the same terminal.
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Failed",
			errorType: "rate_limit",
			occurredAt: 400,
		});
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Stop",
			agentSessionId: "s2",
			occurredAt: 450,
		});
		expect(store.get("t1")?.lastFailure).toBeUndefined();

		// A different terminal never inherits it.
		store.recordEvent({
			terminalId: "t2",
			workspaceId: WORKSPACE,
			eventType: "Stop",
			agentId: "claude",
			occurredAt: 500,
		});
		expect(store.get("t2")?.lastFailure).toBeUndefined();
		expect(store.get("t2")?.lastTransitionAt).toBeUndefined();
	});

	// The hook router normalizes SessionStart to "Attached" before the store
	// ever sees it, and a relaunched conversation resumes its own session id —
	// so a session start must drop the previous run's evidence even though
	// nothing about the session id changed.
	it("drops the failure and transition when the session restarts as Attached", () => {
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Start",
			agentId: "claude",
			agentSessionId: "s1",
			occurredAt: 100,
		});
		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Failed",
			errorType: "rate_limit",
			agentId: "claude",
			agentSessionId: "s1",
			occurredAt: 200,
		});
		expect(store.get("t1")?.lastFailure).toEqual({
			errorType: "rate_limit",
			at: 200,
		});
		expect(store.get("t1")?.lastTransitionAt).toBe(200);

		store.recordEvent({
			terminalId: "t1",
			workspaceId: WORKSPACE,
			eventType: "Attached",
			agentId: "claude",
			agentSessionId: "s1",
			occurredAt: 300,
		});

		expect(store.get("t1")?.lastFailure).toBeUndefined();
		expect(store.get("t1")?.lastTransitionAt).toBeUndefined();
		// The start still does not rewrite the lifecycle state it arrived after.
		expect(store.get("t1")?.lastEventType).toBe("Failed");
	});
});
