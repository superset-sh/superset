import { afterEach, describe, expect, it, jest, mock } from "bun:test";
import type { AgentIdentity } from "@superset/shared/agent-identity";
import {
	GROK_PERMISSION_DEBOUNCE_MS,
	GrokLifecycleInterpreter,
} from "@superset/shared/grok-lifecycle";
import type { AgentLifecycleEventType } from "../../../events";
import { TerminalAgentStore } from "../../../terminal-agents";
import type { HostServiceContext } from "../../../types";
import { notificationsRouter } from "./notifications";

interface BroadcastedAgentLifecycleEvent {
	workspaceId: string;
	eventType: AgentLifecycleEventType;
	terminalId: string;
	agent?: AgentIdentity;
	occurredAt: number;
}

function createContext(originWorkspaceId: string | null): {
	ctx: HostServiceContext;
	broadcastAgentLifecycle: ReturnType<
		typeof mock<(event: BroadcastedAgentLifecycleEvent) => void>
	>;
	findFirst: ReturnType<typeof mock>;
	terminalAgentStore: TerminalAgentStore;
	grokLifecycle: GrokLifecycleInterpreter;
} {
	const broadcastAgentLifecycle = mock(
		(_event: BroadcastedAgentLifecycleEvent) => {},
	);
	const findFirst = mock(() => ({
		sync: () =>
			originWorkspaceId === null
				? null
				: {
						originWorkspaceId,
						status: "active",
					},
	}));
	const terminalAgentStore = new TerminalAgentStore();
	const grokLifecycle = new GrokLifecycleInterpreter();

	const ctx = {
		db: {
			query: {
				terminalSessions: {
					findFirst,
				},
			},
		},
		eventBus: {
			broadcastAgentLifecycle,
		},
		grokLifecycle,
		terminalAgentStore,
	} as unknown as HostServiceContext;

	return {
		ctx,
		broadcastAgentLifecycle,
		findFirst,
		terminalAgentStore,
		grokLifecycle,
	};
}

describe("notificationsRouter.hook", () => {
	afterEach(() => {
		jest.useRealTimers();
	});
	it("derives workspaceId from terminalId before broadcasting", async () => {
		const { ctx, broadcastAgentLifecycle, findFirst } =
			createContext("workspace-1");
		const caller = notificationsRouter.createCaller(ctx);

		const result = await caller.hook({
			terminalId: "terminal-1",
			eventType: "task_complete",
		});

		expect(result).toEqual({ success: true, ignored: false });
		expect(findFirst).toHaveBeenCalledTimes(1);
		expect(broadcastAgentLifecycle).toHaveBeenCalledTimes(1);
		expect(broadcastAgentLifecycle.mock.calls[0]?.[0]).toMatchObject({
			workspaceId: "workspace-1",
			eventType: "Stop",
			terminalId: "terminal-1",
		});
		expect(typeof broadcastAgentLifecycle.mock.calls[0]?.[0].occurredAt).toBe(
			"number",
		);
	});

	it("ignores missing or unknown terminal ids", async () => {
		const missingTerminal = createContext("workspace-1");
		const missingResult = await notificationsRouter
			.createCaller(missingTerminal.ctx)
			.hook({ eventType: "Stop" });

		expect(missingResult).toEqual({ success: true, ignored: true });
		expect(missingTerminal.findFirst).not.toHaveBeenCalled();
		expect(missingTerminal.broadcastAgentLifecycle).not.toHaveBeenCalled();

		const unknownTerminal = createContext(null);
		const unknownResult = await notificationsRouter
			.createCaller(unknownTerminal.ctx)
			.hook({ terminalId: "terminal-missing", eventType: "Stop" });

		expect(unknownResult).toEqual({ success: true, ignored: true });
		expect(unknownTerminal.findFirst).toHaveBeenCalledTimes(1);
		expect(unknownTerminal.broadcastAgentLifecycle).not.toHaveBeenCalled();
	});

	it("ignores unknown event types before looking up the terminal", async () => {
		const { ctx, broadcastAgentLifecycle, findFirst } =
			createContext("workspace-1");
		const caller = notificationsRouter.createCaller(ctx);

		const result = await caller.hook({
			terminalId: "terminal-1",
			eventType: "unknown-event",
		});

		expect(result).toEqual({ success: true, ignored: true });
		expect(findFirst).not.toHaveBeenCalled();
		expect(broadcastAgentLifecycle).not.toHaveBeenCalled();
	});

	it("forwards agent identity when the hook stamps it", async () => {
		const { ctx, broadcastAgentLifecycle } = createContext("workspace-1");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-1",
			eventType: "Stop",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});

		expect(broadcastAgentLifecycle).toHaveBeenCalledTimes(1);
		expect(broadcastAgentLifecycle.mock.calls[0]?.[0]).toMatchObject({
			workspaceId: "workspace-1",
			terminalId: "terminal-1",
			eventType: "Stop",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});
	});

	it("normalizes empty-string identity fields to undefined", async () => {
		const { ctx, broadcastAgentLifecycle } = createContext("workspace-1");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-1",
			eventType: "Stop",
			agent: { agentId: "claude", sessionId: "" },
		});

		const broadcast = broadcastAgentLifecycle.mock.calls[0]?.[0];
		expect(broadcast?.agent).toEqual({ agentId: "claude" });
	});

	it("records the event onto the terminal agent store", async () => {
		const { ctx, terminalAgentStore } = createContext("workspace-1");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-1",
			eventType: "SessionStart",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});

		const binding = terminalAgentStore.get("terminal-1");
		expect(binding?.agentId).toBe("claude");
		expect(binding?.agentSessionId).toBe("session-abc");
		expect(binding?.workspaceId).toBe("workspace-1");
		expect(binding?.lastEventType).toBe("Attached");
	});

	it("maps Claude Code's StopFailure API-error hook to a Failed event and records it", async () => {
		const { ctx, broadcastAgentLifecycle, terminalAgentStore } =
			createContext("workspace-1");
		const caller = notificationsRouter.createCaller(ctx);

		await caller.hook({
			terminalId: "terminal-1",
			eventType: "SessionStart",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});
		const result = await caller.hook({
			terminalId: "terminal-1",
			eventType: "StopFailure",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});

		expect(result).toEqual({ success: true, ignored: false });
		const failedBroadcast = broadcastAgentLifecycle.mock.calls.at(-1)?.[0];
		expect(failedBroadcast).toMatchObject({
			workspaceId: "workspace-1",
			eventType: "Failed",
			terminalId: "terminal-1",
			// Failed keeps the agent identifiable, unlike an exit that drops it.
			agent: { agentId: "claude", sessionId: "session-abc" },
		});
		const binding = terminalAgentStore.get("terminal-1");
		expect(binding?.lastEventType).toBe("Failed");
		expect(binding?.agentId).toBe("claude");
		expect(binding?.agentSessionId).toBe("session-abc");
	});

	it("drops agent identity entirely when agentId is missing", async () => {
		const { ctx, broadcastAgentLifecycle } = createContext("workspace-1");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-1",
			eventType: "Stop",
			agent: { agentId: "" },
		});

		const broadcast = broadcastAgentLifecycle.mock.calls[0]?.[0];
		expect(broadcast?.agent).toBeUndefined();
	});

	it("suppresses Grok permission notifications that resolve immediately", async () => {
		jest.useFakeTimers();
		const { ctx, broadcastAgentLifecycle, terminalAgentStore, grokLifecycle } =
			createContext("workspace-1");
		const caller = notificationsRouter.createCaller(ctx);
		const agent = { agentId: "grok", sessionId: "grok-session" };

		await caller.hook({
			terminalId: "terminal-1",
			eventType: "session_start",
			agent,
		});
		await caller.hook({
			terminalId: "terminal-1",
			eventType: "user_prompt_submit",
			agent,
		});
		broadcastAgentLifecycle.mockClear();

		await caller.hook({
			terminalId: "terminal-1",
			eventType: "notification",
			notificationType: "permission_prompt",
			agent,
		});
		await caller.hook({
			terminalId: "terminal-1",
			eventType: "post_tool_use",
			agent,
		});
		jest.advanceTimersByTime(GROK_PERMISSION_DEBOUNCE_MS);

		expect(broadcastAgentLifecycle).toHaveBeenCalledTimes(1);
		expect(broadcastAgentLifecycle.mock.calls[0]?.[0].eventType).toBe("Start");
		expect(terminalAgentStore.get("terminal-1")?.lastEventType).toBe("Start");
		grokLifecycle.dispose();
	});

	it("publishes a delayed Grok permission request when the turn remains blocked", async () => {
		jest.useFakeTimers();
		const { ctx, broadcastAgentLifecycle, terminalAgentStore, grokLifecycle } =
			createContext("workspace-1");
		const caller = notificationsRouter.createCaller(ctx);
		const agent = { agentId: "grok", sessionId: "grok-session" };

		await caller.hook({
			terminalId: "terminal-1",
			eventType: "session_start",
			agent,
		});
		await caller.hook({
			terminalId: "terminal-1",
			eventType: "user_prompt_submit",
			agent,
		});
		broadcastAgentLifecycle.mockClear();
		await caller.hook({
			terminalId: "terminal-1",
			eventType: "notification",
			notificationType: "permission_prompt",
			agent,
		});

		jest.advanceTimersByTime(GROK_PERMISSION_DEBOUNCE_MS - 1);
		expect(broadcastAgentLifecycle).not.toHaveBeenCalled();
		jest.advanceTimersByTime(1);

		expect(broadcastAgentLifecycle).toHaveBeenCalledTimes(1);
		expect(broadcastAgentLifecycle.mock.calls[0]?.[0]).toMatchObject({
			eventType: "PermissionRequest",
			agent,
		});
		expect(terminalAgentStore.get("terminal-1")?.lastEventType).toBe(
			"PermissionRequest",
		);
		grokLifecycle.dispose();
	});

	it("does not let a cleared Grok status reappear from a pending timer", async () => {
		jest.useFakeTimers();
		const { ctx, broadcastAgentLifecycle, terminalAgentStore, grokLifecycle } =
			createContext("workspace-1");
		const caller = notificationsRouter.createCaller(ctx);
		const agent = { agentId: "grok", sessionId: "grok-session" };

		await caller.hook({
			terminalId: "terminal-1",
			eventType: "session_start",
			agent,
		});
		await caller.hook({
			terminalId: "terminal-1",
			eventType: "user_prompt_submit",
			agent,
		});
		await caller.hook({
			terminalId: "terminal-1",
			eventType: "notification",
			notificationType: "permission_prompt",
			agent,
		});
		broadcastAgentLifecycle.mockClear();
		terminalAgentStore.clearWorkspaceStatuses("workspace-1", "terminal-1");
		jest.advanceTimersByTime(GROK_PERMISSION_DEBOUNCE_MS);

		expect(broadcastAgentLifecycle).not.toHaveBeenCalled();
		expect(terminalAgentStore.get("terminal-1")?.lastEventType).toBe("Stop");
		grokLifecycle.dispose();
	});
});
