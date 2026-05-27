import { beforeEach, describe, expect, it } from "bun:test";
import { TerminalAgentStore } from "./store";

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
});
