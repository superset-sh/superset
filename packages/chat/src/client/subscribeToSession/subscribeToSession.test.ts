import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ChatRuntime, FakeHarnessScript } from "@superset/chat-runtime";
import {
	agentMessage,
	createRecordingSink,
	createTestRuntime,
	FAKE_HARNESS,
	fakeHarnessRegistry,
	turn,
	waitFor,
} from "@superset/chat-runtime/testing";
import { emptySnapshot, reduceMany } from "../../core";
import type { Envelope } from "../../protocol/envelope";
import { createManualWait } from "../../testing/manualWait";
import { createMemoryStreamServer } from "../../testing/memoryStream";
import type { StreamSocket, StreamStatus } from "./subscribeToSession";
import { buildStreamUrl, subscribeToSession } from "./subscribeToSession";

const STREAMING_TURN: FakeHarnessScript = {
	turns: [
		[
			{ kind: "turn", turn: turn("t1") },
			{ kind: "delta", delta: { type: "text", itemId: "a1", append: "a" } },
			{ kind: "delta", delta: { type: "text", itemId: "a1", append: "b" } },
			{ kind: "item", item: agentMessage("a1", "ab"), turnId: "t1" },
			{
				kind: "turn",
				turn: turn("t1", { status: "completed", completedAtMs: 2 }),
			},
			{ kind: "session", session: { status: "idle" } },
		],
	],
};

function startStack(script: FakeHarnessScript): {
	runtime: ChatRuntime;
	server: ReturnType<typeof createMemoryStreamServer>;
	sessionId: string;
} {
	const { harnesses } = fakeHarnessRegistry(script);
	const runtime = createTestRuntime({ harnesses });
	const server = createMemoryStreamServer(runtime);
	const created = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: FAKE_HARNESS,
		cwd: "/tmp/workspace",
	});
	return { runtime, server, sessionId: created.sessionId };
}

function prompt(runtime: ChatRuntime, sessionId: string): void {
	runtime.commands.prompt({
		commandId: randomUUID(),
		sessionId,
		clientId: "client-1",
		content: [{ type: "text", text: "go" }],
	});
}

describe("buildStreamUrl", () => {
	test("formats the stream path with encoded since and delta channels", () => {
		expect(
			buildStreamUrl({
				baseUrl: "ws://host/chat-v3/",
				sessionId: "session one",
				deltas: ["text", "terminal"],
				since: { epoch: "e1", seq: 5 },
			}),
		).toBe(
			"ws://host/chat-v3/sessions/session%20one/stream?since=e1%3A5&deltas=text,terminal",
		);
		expect(
			buildStreamUrl({
				baseUrl: "ws://host/chat-v3",
				sessionId: "s",
				deltas: [],
				since: null,
			}),
		).toBe("ws://host/chat-v3/sessions/s/stream");
	});
});

describe("subscribeToSession", () => {
	test("a dropped consumer resumes from its cursor and converges with one that never dropped", async () => {
		const { runtime, server, sessionId } = startStack(STREAMING_TURN);
		const always = createRecordingSink();
		runtime.subscribe(sessionId, { deltas: [] }, always.sink);

		const manual = createManualWait();
		const received: Envelope[] = [];
		const stream = subscribeToSession({
			createSocket: server.createSocket,
			url: (since) =>
				buildStreamUrl({
					baseUrl: "ws://test/chat-v3",
					sessionId,
					deltas: [],
					since,
				}),
			onEnvelope: (envelope) => received.push(envelope),
			wait: manual.wait,
		});

		prompt(runtime, sessionId);
		await waitFor(() => received.length >= 3);
		server.openConnections()[0]?.drop();
		const droppedAt = received.length;

		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");
		expect(received).toHaveLength(droppedAt);
		expect(manual.pendingCount()).toBe(1);

		manual.flush();
		await waitFor(() => received.length === always.envelopes.length);

		expect(received).toEqual(always.envelopes);
		expect(reduceMany(emptySnapshot(), received)).toEqual(
			reduceMany(emptySnapshot(), always.envelopes),
		);
		stream.close();
		await runtime.dispose();
	});

	test("a reset frame clears the resume cursor and signals refetch", async () => {
		const { runtime, server, sessionId } = startStack(STREAMING_TURN);
		const resets: string[] = [];
		const received: Envelope[] = [];
		const stream = subscribeToSession({
			createSocket: server.createSocket,
			url: (since) =>
				buildStreamUrl({
					baseUrl: "ws://test/chat-v3",
					sessionId,
					deltas: [],
					since,
				}),
			since: { epoch: "stale-epoch", seq: 2 },
			onEnvelope: (envelope) => received.push(envelope),
			onReset: (reason) => resets.push(reason),
		});

		await waitFor(() => received.length >= 1);
		expect(resets).toEqual(["epoch_changed"]);
		expect(received[0]).toMatchObject({ reset: { reason: "epoch_changed" } });
		expect(stream.cursor()).toBeNull();

		prompt(runtime, sessionId);
		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");
		await waitFor(() => received.length > 1);
		expect(stream.cursor()).not.toBeNull();
		stream.close();
		await runtime.dispose();
	});

	test("reconnect delays grow exponentially, cap, and reset after a successful open", async () => {
		const manual = createManualWait();
		const failing = (url: string): StreamSocket => {
			void url;
			const socket: StreamSocket = {
				onopen: null,
				onmessage: null,
				onclose: null,
				onerror: null,
				close() {},
			};
			queueMicrotask(() => socket.onclose?.());
			return socket;
		};
		const received: Envelope[] = [];
		const stream = subscribeToSession({
			createSocket: failing,
			url: () => "ws://test/chat-v3/sessions/s/stream",
			onEnvelope: (envelope) => received.push(envelope),
			wait: manual.wait,
			backoffInitialMs: 100,
			backoffMaxMs: 1000,
		});

		for (let round = 0; round < 5; round += 1) {
			await waitFor(() => manual.pendingCount() === 1);
			manual.flush();
		}
		await waitFor(() => manual.delays.length >= 5);
		expect(manual.delays.slice(0, 5)).toEqual([100, 200, 400, 800, 1000]);
		stream.close();

		const { runtime, server, sessionId } = startStack(STREAMING_TURN);
		const reopening = createManualWait();
		const statuses: StreamStatus[] = [];
		const reopened = subscribeToSession({
			createSocket: server.createSocket,
			url: (since) =>
				buildStreamUrl({
					baseUrl: "ws://test/chat-v3",
					sessionId,
					deltas: [],
					since,
				}),
			onEnvelope: () => {},
			onStatusChange: (status) => statuses.push(status),
			wait: reopening.wait,
			backoffInitialMs: 100,
			backoffMaxMs: 1000,
		});

		await waitFor(() => statuses.includes("open"));
		server.openConnections()[0]?.drop();
		await waitFor(() => reopening.delays.length === 1);
		reopening.flush();
		await waitFor(
			() => statuses.filter((status) => status === "open").length >= 2,
		);
		server.openConnections()[0]?.drop();
		await waitFor(() => reopening.delays.length === 2);
		expect(reopening.delays).toEqual([100, 100]);
		reopened.close();
		await runtime.dispose();
	});
});
