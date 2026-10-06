import { describe, expect, it, mock } from "bun:test";
import type { Envelope, SessionStatus } from "@superset/chat/protocol";
import type { LiveSession } from "@superset/chat-runtime";
import { TerminalAgentStore } from "../terminal-agents";
import type { HostServiceContext } from "../types";
import { createChatAgentBridge } from "./chatAgentBridge";

const WORKSPACE = "workspace-1";
const TERMINAL = "terminal-1";

function setup() {
	const lifecycle = mock(
		(_event: { eventType: string; terminalId: string; preview?: string }) => {},
	);
	const terminalAgentStore = new TerminalAgentStore();
	const bindingsChanged = mock((_event: unknown) => {});
	const ctx = {
		db: {
			query: {
				workspaces: { findFirst: () => ({ sync: () => undefined }) },
			},
		},
		eventBus: {
			broadcastAgentLifecycle: lifecycle,
			broadcastAgentBindingsChanged: bindingsChanged,
		},
		terminalAgentStore,
	} as unknown as HostServiceContext;
	const bridge = createChatAgentBridge(ctx, { detailBroadcastMs: 60_000 });
	let seq = 0;
	const session = { queuedCount: 0 } as LiveSession;
	const publish = (sessionId: string, event: unknown) =>
		bridge.published(
			{
				v: 1,
				sessionId,
				ts: 0,
				cursor: { epoch: "e", seq: seq++ },
				event,
			} as Envelope,
			session,
		);
	const status = (sessionId: string, value: SessionStatus) =>
		publish(sessionId, {
			type: "session",
			session: { status: value, harness: "claude-acp" },
		});
	const reply = (sessionId: string, text: string) =>
		publish(sessionId, {
			type: "item",
			turnId: "turn-1",
			item: { id: "item-1", kind: "agent_message", text, startedAtMs: 0 },
		});
	const start = (sessionId: string) =>
		bridge.started({
			sessionId,
			scopeId: WORKSPACE,
			harness: "claude-acp",
			cwd: "/tmp",
			terminalId: TERMINAL,
		});
	return {
		bridge,
		lifecycle,
		terminalAgentStore,
		status,
		reply,
		start,
		publish,
		publishDelta: (sessionId: string, delta: unknown) =>
			bridge.published({ v: 1, sessionId, ts: 0, delta } as Envelope, session),
		session,
		bindingsChanged,
	};
}

describe("createChatAgentBridge", () => {
	it("lists the chat as the terminal's agent while it runs", () => {
		const { bridge, terminalAgentStore, start } = setup();
		start("chat-1");
		expect(terminalAgentStore.listByWorkspace(WORKSPACE)).toMatchObject([
			{ terminalId: TERMINAL, agentId: "claude", lastEventType: "Attached" },
		]);
		bridge.stopped("chat-1");
		expect(terminalAgentStore.listByWorkspace(WORKSPACE)).toEqual([]);
	});

	it("reports a turn as Start then Stop with the agent's reply", () => {
		const { bridge, lifecycle, status, reply, start } = setup();
		start("chat-1");
		status("chat-1", "idle");
		status("chat-1", "running");
		reply("chat-1", "Done.");
		status("chat-1", "idle");
		expect(lifecycle.mock.calls.map(([event]) => event.eventType)).toEqual([
			"Start",
			"Stop",
		]);
		expect(lifecycle.mock.calls[1]?.[0].preview).toBe("Done.");
		bridge.stopped("chat-1");
	});

	it("lists the chat's background tasks on its binding", () => {
		const { bridge, terminalAgentStore, start, publish } = setup();
		start("chat-1");
		publish("chat-1", {
			type: "session",
			session: {
				status: "running",
				harness: "claude-acp",
				backgroundTasks: [
					{
						id: "task-1",
						kind: "process",
						name: "mint dev",
						canStop: true,
						startedAtMs: 0,
					},
				],
			},
		});
		expect(terminalAgentStore.listByWorkspace(WORKSPACE)).toMatchObject([
			{ chatSessionId: "chat-1", backgroundTasks: [{ name: "mint dev" }] },
		]);
		bridge.stopped("chat-1");
	});

	it("counts the chat's queued prompts on its binding", () => {
		const { bridge, terminalAgentStore, start, status, session } = setup();
		start("chat-1");
		(session as { queuedCount: number }).queuedCount = 2;
		status("chat-1", "running");
		expect(
			terminalAgentStore.listByWorkspace(WORKSPACE)[0]?.queuedPrompts,
		).toBe(2);
		(session as { queuedCount: number }).queuedCount = 0;
		status("chat-1", "idle");
		expect(
			terminalAgentStore.listByWorkspace(WORKSPACE)[0]?.queuedPrompts,
		).toBeUndefined();
		bridge.stopped("chat-1");
	});

	it("falls back to the earlier session when its replacement stops", () => {
		const { bridge, terminalAgentStore, start } = setup();
		start("chat-1");
		start("chat-2");
		bridge.stopped("chat-2");
		expect(terminalAgentStore.listByWorkspace(WORKSPACE)).toMatchObject([
			{ chatSessionId: "chat-1" },
		]);
		bridge.stopped("chat-1");
		expect(terminalAgentStore.listByWorkspace(WORKSPACE)).toEqual([]);
	});

	it("records a background task's step without announcing it at once", () => {
		const {
			bridge,
			terminalAgentStore,
			start,
			publish,
			publishDelta,
			bindingsChanged,
		} = setup();
		start("chat-1");
		publish("chat-1", {
			type: "session",
			session: {
				status: "running",
				harness: "claude-acp",
				backgroundTasks: [
					{
						id: "a",
						kind: "subagent",
						name: "Review",
						canStop: false,
						startedAtMs: 0,
					},
				],
			},
		});
		const afterList = bindingsChanged.mock.calls.length;
		publishDelta("chat-1", {
			type: "background",
			itemId: "a",
			append: "Reading README.md",
		});
		expect(bindingsChanged.mock.calls.length).toBe(afterList);
		expect(
			terminalAgentStore.listByWorkspace(WORKSPACE)[0]?.backgroundTasks?.[0]
				?.detail,
		).toBe("Reading README.md");
		bridge.stopped("chat-1");
	});

	it("keeps the binding when a replaced session stops", () => {
		const { bridge, terminalAgentStore, start } = setup();
		start("chat-1");
		start("chat-2");
		bridge.stopped("chat-1");
		expect(terminalAgentStore.listByWorkspace(WORKSPACE)).toMatchObject([
			{ chatSessionId: "chat-2" },
		]);
		bridge.stopped("chat-2");
	});

	it("does not bring back a chat its established replacement left behind", () => {
		const { bridge, terminalAgentStore, start, status } = setup();
		start("chat-1");
		start("chat-2");
		status("chat-2", "idle");
		bridge.stopped("chat-2");
		expect(terminalAgentStore.listByWorkspace(WORKSPACE)).toEqual([]);
		bridge.stopped("chat-1");
	});
});
