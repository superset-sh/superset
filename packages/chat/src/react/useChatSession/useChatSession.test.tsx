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

let latest: ChatSession | null = null;
let renders = 0;

function Probe(props: {
	client: SessionClient;
	scheduler?: FrameScheduler;
	pageSize?: number;
}) {
	renders += 1;
	latest = useChatSession({
		client: props.client,
		deltas: [],
		scheduler: props.scheduler,
		pageSize: props.pageSize,
	});
	return null;
}

function session(): ChatSession {
	if (!latest) throw new Error("hook not rendered");
	return latest;
}

describe("useChatSession", () => {
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

		const client = stack.makeClient();
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

	test("auto-resyncs through getItems when the stream resets", async () => {
		const stack = await startStack();
		let getItemsCalls = 0;
		const countingTransport: ChatTransport = {
			createSession: (input) => stack.transport.createSession(input),
			prompt: (input) => stack.transport.prompt(input),
			cancelTurn: (input) => stack.transport.cancelTurn(input),
			respondToApproval: (input) => stack.transport.respondToApproval(input),
			setMode: (input) => stack.transport.setMode(input),
			getSession: (input) => stack.transport.getSession(input),
			listSessions: (input) => stack.transport.listSessions(input),
			getItems: (input) => {
				getItemsCalls += 1;
				return stack.transport.getItems(input);
			},
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
