import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { envelopeSchema } from "@superset/chat/protocol";
import type { FakeHarnessScript } from "../../harness/fake";
import type { ChatRuntime } from "../../index";
import { agentMessage, turn } from "../../testing/fixtures";
import { createTestRuntime } from "../../testing/testRuntime";
import {
	createRecordingSink,
	FAKE_HARNESS,
	fakeHarnessRegistry,
	waitFor,
} from "../../testing/testUtils";
import { createWsSink } from "./wsSink";

const SCRIPT: FakeHarnessScript = {
	turns: [
		[
			{ kind: "turn", turn: turn("t1") },
			{ kind: "item", item: agentMessage("a1", "done"), turnId: "t1" },
			{
				kind: "turn",
				turn: turn("t1", { status: "completed", completedAtMs: 2 }),
			},
			{ kind: "session", session: { status: "idle" } },
		],
	],
};

type FakeSocket = {
	send: (data: string) => void;
	close: () => void;
	onclose: ((event?: unknown) => unknown) | null;
};

function createFakeSocket(options: { failSends?: boolean } = {}) {
	const frames: string[] = [];
	let closeCalls = 0;
	const socket: FakeSocket = {
		send: (data) => {
			if (options.failSends) throw new Error("socket gone");
			frames.push(data);
		},
		close: () => {
			closeCalls += 1;
			socket.onclose?.();
		},
		onclose: null,
	};
	return { socket, frames, closeCalls: () => closeCalls };
}

function newRuntime(): { runtime: ChatRuntime; sessionId: string } {
	const { harnesses } = fakeHarnessRegistry(SCRIPT);
	const runtime = createTestRuntime({ harnesses });
	const created = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: FAKE_HARNESS,
		cwd: "/tmp/workspace",
	});
	return { runtime, sessionId: created.sessionId };
}

describe("createWsSink", () => {
	test("serialized envelopes parse back and match a direct subscription", async () => {
		const { runtime, sessionId } = newRuntime();

		const direct = createRecordingSink();
		const { socket, frames } = createFakeSocket();
		runtime.subscribe(sessionId, { deltas: [] }, direct.sink);
		runtime.subscribe(sessionId, { deltas: [] }, createWsSink(socket));

		runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId,
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});
		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");

		const parsed = frames.map((frame) =>
			envelopeSchema.parse(JSON.parse(frame)),
		);
		expect(parsed.length).toBeGreaterThan(0);
		expect(parsed).toEqual(direct.envelopes);
		await runtime.dispose();
	});

	test("close closes the socket once, detaches, and drops later sends", async () => {
		const { runtime, sessionId } = newRuntime();

		const events: unknown[] = [];
		const previous = (event?: unknown) => {
			events.push(event);
		};
		const { socket, frames, closeCalls } = createFakeSocket();
		socket.onclose = previous;
		const sink = createWsSink(socket);
		runtime.subscribe(sessionId, { deltas: [] }, sink);
		const sentBeforeClose = frames.length;

		sink.close();
		sink.close();
		expect(closeCalls()).toBe(1);
		expect(events).toHaveLength(1);
		expect(socket.onclose).toBe(previous);

		sink.send({
			v: 1,
			sessionId,
			ts: Date.now(),
			reset: { reason: "invalid_cursor" },
		});
		expect(frames).toHaveLength(sentBeforeClose);
		await runtime.dispose();
	});

	test("a peer close passes the event through and stops the sink", async () => {
		const { runtime, sessionId } = newRuntime();

		const events: unknown[] = [];
		const previous = (event?: unknown) => {
			events.push(event);
		};
		const { socket, frames } = createFakeSocket();
		socket.onclose = previous;
		const sink = createWsSink(socket);
		runtime.subscribe(sessionId, { deltas: [] }, sink);
		const sentBeforeClose = frames.length;

		const closeEvent = { code: 1000 };
		socket.onclose?.(closeEvent);
		expect(events).toEqual([closeEvent]);
		expect(socket.onclose).toBe(previous);

		sink.send({
			v: 1,
			sessionId,
			ts: Date.now(),
			reset: { reason: "invalid_cursor" },
		});
		expect(frames).toHaveLength(sentBeforeClose);
		await runtime.dispose();
	});

	test("a throwing send closes the sink and socket", async () => {
		const { runtime, sessionId } = newRuntime();

		const { socket, frames, closeCalls } = createFakeSocket({
			failSends: true,
		});
		const sink = createWsSink(socket);

		sink.send({
			v: 1,
			sessionId,
			ts: Date.now(),
			reset: { reason: "invalid_cursor" },
		});
		expect(frames).toHaveLength(0);
		expect(closeCalls()).toBe(1);

		sink.send({
			v: 1,
			sessionId,
			ts: Date.now(),
			reset: { reason: "invalid_cursor" },
		});
		expect(closeCalls()).toBe(1);
		await runtime.dispose();
	});
});
