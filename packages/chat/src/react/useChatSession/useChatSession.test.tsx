import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ChatRuntime, FakeHarnessScript } from "@superset/chat-runtime";
import {
	createChatCallerFactory,
	createChatRouter,
} from "@superset/chat-runtime";
import {
	agentMessage,
	createManualSchedule,
	createRecordingSink,
	createTestRuntime,
	FAKE_HARNESS,
	fakeHarnessRegistry,
	turn,
	waitFor,
} from "@superset/chat-runtime/testing";
import type { ChatTransport, SessionClient } from "../../client";
import { createSessionClient } from "../../client";
import { emptySnapshot, reduceMany } from "../../core";
import type { ToolCall } from "../../protocol/items";
import { createManualWait } from "../../testing/manualWait";
import { createMemoryStreamServer } from "../../testing/memoryStream";
import { registerDom } from "../../testing/registerDom";
import type { ChatSession, FrameScheduler } from "./useChatSession";
import { useChatSession } from "./useChatSession";

registerDom();
const {
	act,
	render,
	waitFor: domWaitFor,
} = await import("@testing-library/react");

function turnScript(
	turnId: string,
	itemId: string,
): FakeHarnessScript["turns"][number] {
	return [
		{ kind: "turn", turn: turn(turnId) },
		{ kind: "item", item: agentMessage(itemId, "done"), turnId },
		{
			kind: "turn",
			turn: turn(turnId, { status: "completed", completedAtMs: 2 }),
		},
		{ kind: "session", session: { status: "idle" } },
	];
}

const SCRIPT: FakeHarnessScript = {
	turns: [turnScript("t1", "a1"), turnScript("t2", "a2")],
};

type Stack = {
	runtime: ChatRuntime;
	transport: ChatTransport;
	server: ReturnType<typeof createMemoryStreamServer>;
	sessionId: string;
	makeClient(overrides?: {
		wait?: ReturnType<typeof createManualWait>["wait"];
		transport?: ChatTransport;
	}): SessionClient;
};

async function startStack(): Promise<Stack> {
	const { harnesses } = fakeHarnessRegistry(SCRIPT);
	const runtime = createTestRuntime({ harnesses });
	const router = createChatRouter(runtime, {
		resolveCwd: () => "/tmp/workspace",
	});
	const transport: ChatTransport = createChatCallerFactory(router)({});
	const server = createMemoryStreamServer(runtime);
	const created = await transport.createSession({
		commandId: randomUUID(),
		workspaceId: "workspace-1",
		harness: FAKE_HARNESS,
	});
	return {
		runtime,
		transport,
		server,
		sessionId: created.sessionId,
		makeClient: (overrides = {}) =>
			createSessionClient({
				sessionId: created.sessionId,
				transport: overrides.transport ?? transport,
				streamBaseUrl: "ws://test/chat-v3",
				createSocket: server.createSocket,
				wait: overrides.wait,
			}),
	};
}

function olderHost(transport: ChatTransport): ChatTransport {
	return new Proxy(transport, {
		get: (target, prop, receiver) =>
			prop === "getOutline"
				? () => Promise.reject(new Error("No procedure found"))
				: Reflect.get(target, prop, receiver),
	});
}

const OMITTED_TOOL: ToolCall = {
	id: "tool-1",
	kind: "tool_call",
	startedAtMs: 1,
	title: "ls",
	toolKind: "execute",
	toolName: "Bash",
	status: "completed",
	content: [],
	bodyOmitted: true,
};

function withOmittedTool(transport: ChatTransport): ChatTransport {
	return new Proxy(transport, {
		get: (target, prop, receiver) => {
			if (prop === "getOutline") {
				return async (input: { sessionId: string }) => {
					const result = await target.getOutline(input);
					if (!result.ok) return result;
					const turnId = result.outline.turns[0]?.id ?? "t1";
					return {
						ok: true,
						outline: {
							...result.outline,
							items: [...result.outline.items, { item: OMITTED_TOOL, turnId }],
						},
					};
				};
			}
			if (prop === "getItemBodies") {
				return async () => ({
					ok: true,
					items: [
						{
							item: {
								...OMITTED_TOOL,
								bodyOmitted: undefined,
								content: [{ type: "text", text: "a\nb" }],
							},
							turnId: "t1",
						},
					],
				});
			}
			return Reflect.get(target, prop, receiver);
		},
	});
}

let latest: ChatSession | null = null;
let renders = 0;

function Probe(props: {
	client: SessionClient;
	scheduler?: FrameScheduler;
	pageSize?: number;
	wait?: ReturnType<typeof createManualWait>["wait"];
}) {
	renders += 1;
	latest = useChatSession({
		client: props.client,
		deltas: [],
		scheduler: props.scheduler,
		pageSize: props.pageSize,
		wait: props.wait,
	});
	return null;
}

function session(): ChatSession {
	if (!latest) throw new Error("hook not rendered");
	return latest;
}

function unreachableUntil(
	transport: ChatTransport,
	reachable: () => boolean,
): { transport: ChatTransport; prompts: () => number } {
	let prompts = 0;
	const refuse = () => Promise.reject(new Error("fetch failed"));
	const getSession: ChatTransport["getSession"] = (input) =>
		reachable() ? transport.getSession(input) : refuse();
	const prompt: ChatTransport["prompt"] = (input) => {
		prompts += 1;
		return reachable() ? transport.prompt(input) : refuse();
	};
	return {
		transport: new Proxy(transport, {
			get: (target, key) =>
				key === "getSession"
					? getSession
					: key === "prompt"
						? prompt
						: Reflect.get(target, key),
		}),
		prompts: () => prompts,
	};
}

describe("useChatSession", () => {
	test("keeps retrying while the host is unreachable and loads once it answers", async () => {
		const stack = await startStack();
		let up = false;
		const host = unreachableUntil(stack.transport, () => up);
		const manual = createManualWait();
		const client = stack.makeClient({
			transport: host.transport,
			wait: manual.wait,
		});
		const view = render(<Probe client={client} wait={manual.wait} />);

		await domWaitFor(() => expect(manual.pendingCount()).toBeGreaterThan(0));
		act(() => manual.flush());
		await domWaitFor(() => expect(manual.pendingCount()).toBeGreaterThan(0));
		expect(session().status).toBe("loading");
		expect(session().unreachable).toBe(true);

		up = true;
		await domWaitFor(() => {
			act(() => manual.flush());
			expect(session().status).toBe("ready");
		});
		expect(session().unreachable).toBe(false);
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});

	test("holds a prompt sent before the host connects and sends it once connected", async () => {
		const stack = await startStack();
		let up = false;
		const host = unreachableUntil(stack.transport, () => up);
		const manual = createManualWait();
		const client = stack.makeClient({
			transport: host.transport,
			wait: manual.wait,
		});
		const view = render(<Probe client={client} wait={manual.wait} />);

		act(() => {
			session().sendPrompt([{ type: "text", text: "hello" }]);
		});
		expect(session().outbox.map((entry) => entry.state)).toEqual(["queued"]);
		expect(host.prompts()).toBe(0);

		up = true;
		await domWaitFor(() => {
			act(() => manual.flush());
			expect(session().connection).toBe("open");
		});
		await domWaitFor(() => expect(session().outbox).toHaveLength(0));
		expect(host.prompts()).toBe(1);
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});

	test("seeds, streams a turn, and clears the outbox on clientId echo", async () => {
		const stack = await startStack();
		const always = createRecordingSink();
		stack.runtime.subscribe(stack.sessionId, { deltas: [] }, always.sink);

		const client = stack.makeClient();
		const view = render(<Probe client={client} />);
		await domWaitFor(() => expect(session().status).toBe("ready"));

		act(() => {
			session().sendPrompt([{ type: "text", text: "hello" }]);
		});
		expect(session().outbox).toHaveLength(1);

		await domWaitFor(() => expect(session().outbox).toHaveLength(0));
		await domWaitFor(() =>
			expect(session().snapshot.session?.status).toBe("idle"),
		);

		const itemKinds = [...session().snapshot.items.values()].map(
			(stored) => stored.item.kind,
		);
		expect(itemKinds).toContain("user_message");
		expect(itemKinds).toContain("agent_message");

		expect(session().snapshot).toEqual(
			reduceMany(emptySnapshot(), always.envelopes),
		);
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});

	test("reconnects after a drop and converges with a subscriber that never dropped", async () => {
		const stack = await startStack();
		const always = createRecordingSink();
		stack.runtime.subscribe(stack.sessionId, { deltas: [] }, always.sink);

		const manual = createManualWait();
		const client = stack.makeClient({ wait: manual.wait });
		const view = render(<Probe client={client} />);
		await domWaitFor(() => expect(session().status).toBe("ready"));
		await domWaitFor(() => expect(session().connection).toBe("open"));

		act(() => {
			session().sendPrompt([{ type: "text", text: "hello" }]);
		});
		await domWaitFor(() =>
			expect(session().snapshot.turns.size).toBeGreaterThanOrEqual(1),
		);
		act(() => {
			stack.server.openConnections()[0]?.drop();
		});
		expect(session().connection).toBe("closed");

		await waitFor(
			() => stack.runtime.sessions.get(stack.sessionId)?.status === "idle",
		);
		act(() => {
			manual.flush();
		});
		await domWaitFor(() => expect(session().connection).toBe("open"));
		await domWaitFor(() =>
			expect(session().snapshot).toEqual(
				reduceMany(emptySnapshot(), always.envelopes),
			),
		);
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});

	test("coalesces buffered envelopes into one commit per scheduled frame", async () => {
		const stack = await startStack();
		const scheduler = createManualSchedule();
		const client = stack.makeClient();
		const view = render(
			<Probe client={client} scheduler={scheduler.schedule} />,
		);
		await domWaitFor(() => expect(session().status).toBe("ready"));

		act(() => {
			session().sendPrompt([{ type: "text", text: "hello" }]);
		});
		await domWaitFor(() => expect(session().outbox).toHaveLength(1));
		await waitFor(
			() => stack.runtime.sessions.get(stack.sessionId)?.status === "idle",
		);
		await waitFor(() => scheduler.pendingCount() === 1);
		expect(session().snapshot.items.size).toBe(0);

		const before = renders;
		act(() => {
			scheduler.flush();
		});
		expect(renders - before).toBe(1);
		expect(session().snapshot.items.size).toBe(2);
		expect(session().snapshot.session?.status).toBe("idle");
		expect(session().outbox).toHaveLength(0);
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});

	test("loadOlder pages history backwards until exhausted", async () => {
		const stack = await startStack();
		const seedClient = stack.makeClient();
		await seedClient.prompt({
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});
		await waitFor(
			() => stack.runtime.sessions.get(stack.sessionId)?.status === "idle",
		);

		const client = stack.makeClient({ transport: olderHost(stack.transport) });
		const view = render(<Probe client={client} pageSize={2} />);
		await domWaitFor(() => expect(session().status).toBe("ready"));
		expect(session().hasOlder).toBe(true);
		const seededCount = session().snapshot.items.size;

		while (session().hasOlder) {
			await act(async () => {
				await session().loadOlder();
			});
		}
		expect(session().snapshot.items.size).toBeGreaterThanOrEqual(seededCount);
		const full = await client.getItems({});
		if (!full.ok) throw new Error("expected page");
		expect(session().snapshot).toEqual(
			reduceMany(emptySnapshot(), full.envelopes),
		);
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});

	test("seeds the whole session from the outline, with nothing left to page", async () => {
		const stack = await startStack();
		const seedClient = stack.makeClient();
		for (const text of ["one", "two"]) {
			await seedClient.prompt({
				clientId: randomUUID(),
				content: [{ type: "text", text }],
			});
			await waitFor(
				() => stack.runtime.sessions.get(stack.sessionId)?.status === "idle",
			);
		}

		const client = stack.makeClient();
		const view = render(<Probe client={client} pageSize={1} />);
		await domWaitFor(() => expect(session().status).toBe("ready"));
		const full = await client.getItems({});
		if (!full.ok) throw new Error("expected page");
		expect(session().hasOlder).toBe(false);
		expect([...session().snapshot.items.keys()]).toEqual([
			...reduceMany(emptySnapshot(), full.envelopes).items.keys(),
		]);
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});

	test("fills an omitted tool call body on request", async () => {
		const stack = await startStack();
		const client = stack.makeClient({
			transport: withOmittedTool(stack.transport),
		});
		const view = render(<Probe client={client} />);
		await domWaitFor(() => expect(session().status).toBe("ready"));
		expect(session().snapshot.items.get("tool-1")?.item).toEqual(OMITTED_TOOL);

		act(() => session().requestItemBodies(["tool-1"]));
		await domWaitFor(() => {
			const tool = session().snapshot.items.get("tool-1")?.item as
				| ToolCall
				| undefined;
			expect(tool?.content).toEqual([{ type: "text", text: "a\nb" }]);
		});
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});

	test("keeps events that stream in while a resync fetches the outline", async () => {
		const stack = await startStack();
		let hold: Promise<void> | null = null;
		let release = () => {};
		const transport = new Proxy(stack.transport, {
			get: (target, prop, receiver) =>
				prop === "getOutline"
					? async (input: { sessionId: string }) => {
							const result = await target.getOutline(input);
							if (hold) await hold;
							return result;
						}
					: Reflect.get(target, prop, receiver),
		});
		const client = stack.makeClient({ transport });
		const view = render(<Probe client={client} />);
		await domWaitFor(() => expect(session().status).toBe("ready"));
		act(() => {
			session().sendPrompt([{ type: "text", text: "one" }]);
		});
		await domWaitFor(() =>
			expect(session().snapshot.items.has("a1")).toBe(true),
		);
		await domWaitFor(() =>
			expect(session().snapshot.session?.status).toBe("idle"),
		);

		hold = new Promise((resolve) => {
			release = resolve;
		});
		act(() => {
			stack.runtime.subscriptions.publish({
				v: 1,
				sessionId: stack.sessionId,
				ts: Date.now(),
				reset: { reason: "journal_missing" },
			});
		});
		await Bun.sleep(20);
		act(() => {
			session().sendPrompt([{ type: "text", text: "two" }]);
		});
		await domWaitFor(() =>
			expect(session().snapshot.items.has("a2")).toBe(true),
		);
		act(() => release());
		await domWaitFor(() => expect(session().snapshot.pendingReset).toBeNull());
		await Bun.sleep(20);
		expect(session().snapshot.items.has("a2")).toBe(true);
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});

	test("resyncs again for a reset that arrives during a resync", async () => {
		const stack = await startStack();
		let outlines = 0;
		let hold: Promise<void> | null = null;
		let release = () => {};
		const transport = new Proxy(stack.transport, {
			get: (target, prop, receiver) =>
				prop === "getOutline"
					? async (input: { sessionId: string }) => {
							outlines += 1;
							const result = await target.getOutline(input);
							if (hold) await hold;
							return result;
						}
					: Reflect.get(target, prop, receiver),
		});
		const client = stack.makeClient({ transport });
		const view = render(<Probe client={client} />);
		await domWaitFor(() => expect(session().status).toBe("ready"));
		const seeded = outlines;

		hold = new Promise((resolve) => {
			release = resolve;
		});
		const reset = () =>
			act(() => {
				stack.runtime.subscriptions.publish({
					v: 1,
					sessionId: stack.sessionId,
					ts: Date.now(),
					reset: { reason: "journal_missing" },
				});
			});
		reset();
		await domWaitFor(() => expect(outlines).toBe(seeded + 1));
		reset();
		hold = null;
		act(() => release());
		await domWaitFor(() => expect(outlines).toBe(seeded + 2));
		await domWaitFor(() => expect(session().snapshot.pendingReset).toBeNull());
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});

	test("re-requests a body that was in flight across a resync", async () => {
		const stack = await startStack();
		let release = () => {};
		const hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		const requests: string[][] = [];
		const omitted = withOmittedTool(stack.transport);
		const transport = new Proxy(omitted, {
			get: (target, prop, receiver) =>
				prop === "getItemBodies"
					? async (input: { sessionId: string; itemIds: string[] }) => {
							requests.push(input.itemIds);
							const result = await target.getItemBodies(input);
							if (requests.length === 1) await hold;
							return result;
						}
					: Reflect.get(target, prop, receiver),
		});
		const client = stack.makeClient({ transport });
		const view = render(<Probe client={client} />);
		await domWaitFor(() => expect(session().status).toBe("ready"));

		act(() => session().requestItemBodies(["tool-1"]));
		await domWaitFor(() => expect(requests).toHaveLength(1));
		act(() => {
			stack.runtime.subscriptions.publish({
				v: 1,
				sessionId: stack.sessionId,
				ts: Date.now(),
				reset: { reason: "journal_missing" },
			});
		});
		await domWaitFor(() => expect(requests).toEqual([["tool-1"], ["tool-1"]]));
		await domWaitFor(() =>
			expect(session().snapshot.items.get("tool-1")?.item).not.toEqual(
				OMITTED_TOOL,
			),
		);
		act(() => release());
		await Bun.sleep(20);
		expect(session().snapshot.items.get("tool-1")?.item).not.toEqual(
			OMITTED_TOOL,
		);
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});

	test("retries a failed body request after a backoff", async () => {
		const stack = await startStack();
		let failures = 1;
		const omitted = withOmittedTool(stack.transport);
		const transport = new Proxy(omitted, {
			get: (target, prop, receiver) =>
				prop === "getItemBodies"
					? (input: { sessionId: string; itemIds: string[] }) =>
							failures-- > 0
								? Promise.reject(new Error("offline"))
								: target.getItemBodies(input)
					: Reflect.get(target, prop, receiver),
		});
		const manual = createManualWait();
		const client = stack.makeClient({ transport });
		const view = render(<Probe client={client} wait={manual.wait} />);
		await domWaitFor(() => expect(session().status).toBe("ready"));

		act(() => session().requestItemBodies(["tool-1"]));
		await domWaitFor(() => expect(manual.pendingCount()).toBeGreaterThan(0));
		act(() => manual.flush());
		await domWaitFor(() => {
			const tool = session().snapshot.items.get("tool-1")?.item as
				| ToolCall
				| undefined;
			expect(tool?.content).toEqual([{ type: "text", text: "a\nb" }]);
		});
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});

	test("auto-resyncs through getItems when the stream resets", async () => {
		const stack = await startStack();
		let getItemsCalls = 0;
		const countingTransport: ChatTransport = {
			createSession: (input) => stack.transport.createSession(input),
			prompt: (input) => stack.transport.prompt(input),
			removeQueuedPrompt: (input) => stack.transport.removeQueuedPrompt(input),
			steerQueuedPrompt: (input) => stack.transport.steerQueuedPrompt(input),
			resumeQueue: (input) => stack.transport.resumeQueue(input),
			cancelTurn: (input) => stack.transport.cancelTurn(input),
			respondToApproval: (input) => stack.transport.respondToApproval(input),
			setMode: (input) => stack.transport.setMode(input),
			setConfigOption: (input) => stack.transport.setConfigOption(input),
			getSession: (input) => stack.transport.getSession(input),
			getQueue: (input) => stack.transport.getQueue(input),
			listSessions: (input) => stack.transport.listSessions(input),
			getItems: (input) => {
				getItemsCalls += 1;
				return stack.transport.getItems(input);
			},
			getOutline: () => Promise.reject(new Error("No procedure found")),
			getItemBodies: (input) => stack.transport.getItemBodies(input),
		};
		const client = stack.makeClient({ transport: countingTransport });
		const view = render(<Probe client={client} />);
		await domWaitFor(() => expect(session().status).toBe("ready"));

		act(() => {
			session().sendPrompt([{ type: "text", text: "hello" }]);
		});
		await domWaitFor(() =>
			expect(session().snapshot.session?.status).toBe("idle"),
		);
		const itemsBefore = session().snapshot.items.size;
		const callsBefore = getItemsCalls;

		act(() => {
			stack.runtime.subscriptions.publish({
				v: 1,
				sessionId: stack.sessionId,
				ts: Date.now(),
				reset: { reason: "journal_missing" },
			});
		});
		await domWaitFor(() => expect(getItemsCalls).toBeGreaterThan(callsBefore));
		await domWaitFor(() => expect(session().snapshot.pendingReset).toBeNull());
		expect(session().snapshot.items.size).toBe(itemsBefore);
		view.unmount();
		client.close();
		await stack.runtime.dispose();
	});
});
