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

	describe("subagent roster", () => {
		// Roster staleness is measured against the wall clock.
		const NOW = Date.now();
		const attach = () =>
			store.recordEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "Start",
				agentId: "claude",
				agentSessionId: "s1",
				occurredAt: NOW + 100,
			});

		it("tracks a subagent from SubagentStart until SubagentStop without touching the parent", () => {
			attach();
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStart",
				subagentId: "a1",
				agentType: "Explore",
				occurredAt: NOW + 200,
			});

			const binding = store.get("t1");
			expect(binding?.lastEventType).toBe("Start");
			expect(binding?.lastEventAt).toBe(NOW + 100);
			expect(binding?.subagents).toEqual([
				{
					id: "a1",
					agentType: "Explore",
					status: "working",
					startedAt: NOW + 200,
					lastEventAt: NOW + 200,
				},
			]);
			expect(binding?.endedSubagents).toBeUndefined();
			expect(store.listByWorkspace(WORKSPACE)[0]?.subagents).toHaveLength(1);

			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStop",
				subagentId: "a1",
				occurredAt: NOW + 300,
			});
			expect(store.get("t1")?.subagents).toBeUndefined();
			expect(store.get("t1")?.endedSubagents).toEqual([
				{
					id: "a1",
					agentType: "Explore",
					status: "completed",
					startedAt: NOW + 200,
					lastEventAt: NOW + 300,
					endedAt: NOW + 300,
					endReason: "completed",
				},
			]);
		});

		it("derives status from each event: waiting on a permission request, working again on the next tool", () => {
			attach();
			const record = (eventType: string, occurredAt: number) =>
				store.recordSubagentEvent({
					terminalId: "t1",
					workspaceId: WORKSPACE,
					eventType,
					subagentId: "a1",
					occurredAt,
				});
			record("SubagentStart", NOW + 200);
			expect(store.get("t1")?.subagents?.[0]?.status).toBe("working");
			record("PermissionRequest", NOW + 210);
			expect(store.get("t1")?.subagents?.[0]?.status).toBe("waiting");
			record("PostToolUse", NOW + 220);
			expect(store.get("t1")?.subagents?.[0]?.status).toBe("working");
			record("Notification", NOW + 230);
			expect(store.get("t1")?.subagents?.[0]?.status).toBe("waiting");
			record("SubagentStop", NOW + 240);
			expect(store.get("t1")?.subagents).toBeUndefined();
			expect(store.get("t1")?.endedSubagents?.[0]).toMatchObject({
				status: "completed",
				endReason: "completed",
				endedAt: NOW + 240,
			});
		});

		it("records the latest tool as activity and keeps it across non-tool events", () => {
			attach();
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "PreToolUse",
				subagentId: "a1",
				toolName: "Bash",
				toolSummary: `  ${"x".repeat(200)}  `,
				occurredAt: NOW + 200,
			});
			expect(store.get("t1")?.subagents?.[0]?.activity).toEqual({
				toolName: "Bash",
				summary: `${"x".repeat(160)}…`,
				at: NOW + 200,
			});

			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "PostToolUse",
				subagentId: "a1",
				toolName: "Read",
				toolSummary: "/repo/file.ts",
				occurredAt: NOW + 210,
			});
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "PermissionRequest",
				subagentId: "a1",
				occurredAt: NOW + 220,
			});
			expect(store.get("t1")?.subagents?.[0]?.activity).toEqual({
				toolName: "Read",
				summary: "/repo/file.ts",
				at: NOW + 210,
			});

			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStop",
				subagentId: "a1",
				occurredAt: NOW + 230,
			});
			expect(store.get("t1")?.endedSubagents?.[0]?.activity).toEqual({
				toolName: "Read",
				summary: "/repo/file.ts",
				at: NOW + 210,
			});
		});

		it("applies the parent placement once and never overwrites it", () => {
			attach();
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStart",
				subagentId: "a1",
				sessionId: "child-thread",
				occurredAt: NOW + 200,
			});
			expect(store.get("t1")?.subagents?.[0]).toMatchObject({
				sessionId: "child-thread",
			});
			expect(store.get("t1")?.subagents?.[0]?.parentUnknown).toBeUndefined();

			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "PostToolUse",
				subagentId: "a1",
				parent: { parentSubagentId: "a0", known: true },
				occurredAt: NOW + 210,
			});
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "PostToolUse",
				subagentId: "a1",
				parent: { known: false },
				occurredAt: NOW + 220,
			});
			expect(store.get("t1")?.subagents?.[0]).toMatchObject({
				parentSubagentId: "a0",
				sessionId: "child-thread",
			});
			expect(store.get("t1")?.subagents?.[0]?.parentUnknown).toBeUndefined();

			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStart",
				subagentId: "a2",
				parent: { known: false },
				occurredAt: NOW + 230,
			});
			expect(store.get("t1")?.subagents?.[1]).toMatchObject({
				id: "a2",
				parentUnknown: true,
			});
		});

		it("re-adds a child from its tool events when the start was missed and keeps the earlier type", () => {
			attach();
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStart",
				subagentId: "a1",
				agentType: "general-purpose",
				occurredAt: NOW + 200,
			});
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "PostToolUse",
				subagentId: "a1",
				occurredAt: NOW + 250,
			});
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "PostToolUse",
				subagentId: "a2",
				agentType: "Plan",
				occurredAt: NOW + 260,
			});

			expect(store.get("t1")?.subagents).toEqual([
				{
					id: "a1",
					agentType: "general-purpose",
					status: "working",
					startedAt: NOW + 200,
					lastEventAt: NOW + 250,
				},
				{
					id: "a2",
					agentType: "Plan",
					status: "working",
					startedAt: NOW + 260,
					lastEventAt: NOW + 260,
				},
			]);
		});

		it("ignores subagent events for a terminal with no live agent", () => {
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStart",
				subagentId: "a1",
				occurredAt: NOW + 200,
			});
			expect(store.get("t1")).toBeUndefined();
			attach();
			expect(store.get("t1")?.subagents).toBeUndefined();
		});

		it("drops the roster when the parent ends or a new session starts in the terminal", () => {
			attach();
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStart",
				subagentId: "a1",
				occurredAt: NOW + 200,
			});
			store.recordEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "Attached",
				agentId: "claude",
				agentSessionId: "s2",
				occurredAt: NOW + 300,
			});
			expect(store.get("t1")?.subagents).toBeUndefined();

			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStart",
				subagentId: "a2",
				occurredAt: NOW + 400,
			});
			expect(store.get("t1")?.subagents).toHaveLength(1);
			store.markTerminalExited("t1");
			attach();
			expect(store.get("t1")?.subagents).toBeUndefined();
		});

		it("marks a child that went quiet without a stop as stopped", () => {
			attach();
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStart",
				subagentId: "a1",
				agentType: "Explore",
				occurredAt: NOW - 11 * 60_000,
			});
			expect(store.get("t1")?.subagents).toBeUndefined();
			expect(store.get("t1")?.endedSubagents).toEqual([
				{
					id: "a1",
					agentType: "Explore",
					status: "stopped",
					startedAt: NOW - 11 * 60_000,
					lastEventAt: NOW - 11 * 60_000,
					endedAt: NOW - 60_000,
					endReason: "stale",
				},
			]);
			expect(store.getSubagent("t1", "a1")?.status).toBe("stopped");
		});

		it("drops an ended child once its retention lapses", () => {
			attach();
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStart",
				subagentId: "a1",
				occurredAt: NOW - 3 * 60 * 60_000,
			});
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStop",
				subagentId: "a1",
				occurredAt: NOW - 2 * 60 * 60_000,
			});
			expect(store.get("t1")?.endedSubagents).toBeUndefined();
			expect(store.getSubagent("t1", "a1")).toBeUndefined();
		});

		it("caps the roster per terminal, dropping the oldest child", () => {
			attach();
			for (let i = 0; i < 70; i += 1) {
				store.recordSubagentEvent({
					terminalId: "t1",
					workspaceId: WORKSPACE,
					eventType: "SubagentStart",
					subagentId: `a${i}`,
					occurredAt: NOW + 200 + i,
				});
			}
			const ids = store.get("t1")?.subagents?.map((s) => s.id) ?? [];
			expect(ids).toHaveLength(64);
			expect(ids[0]).toBe("a6");
			expect(ids[ids.length - 1]).toBe("a69");
		});

		it("emits change on roster mutations only", () => {
			attach();
			const changes: string[] = [];
			store.on("change", (workspaceId: string) => changes.push(workspaceId));
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStop",
				subagentId: "never-started",
				occurredAt: NOW + 200,
			});
			expect(changes).toEqual([]);
			store.recordSubagentEvent({
				terminalId: "t1",
				workspaceId: WORKSPACE,
				eventType: "SubagentStart",
				subagentId: "a1",
				occurredAt: NOW + 200,
			});
			expect(changes).toEqual([WORKSPACE]);
		});
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
