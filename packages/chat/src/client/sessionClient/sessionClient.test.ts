import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ChatRuntime, FakeHarnessScript } from "@superset/chat-runtime";
import {
	createChatCallerFactory,
	createChatRouter,
} from "@superset/chat-runtime";
import {
	agentMessage,
	createTestRuntime,
	FAKE_HARNESS,
	fakeHarnessRegistry,
	turn,
	waitFor,
} from "@superset/chat-runtime/testing";
import type { Envelope } from "../../protocol/envelope";
import { isDurableEnvelope } from "../../protocol/envelope";
import { createMemoryStreamServer } from "../../testing/memoryStream";
import type { ChatTransport } from "./sessionClient";
import { createSessionClient } from "./sessionClient";

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

function startStack(): {
	runtime: ChatRuntime;
	transport: ChatTransport;
	server: ReturnType<typeof createMemoryStreamServer>;
} {
	const { harnesses } = fakeHarnessRegistry(SCRIPT);
	const runtime = createTestRuntime({ harnesses });
	const router = createChatRouter(runtime, {
		resolveCwd: () => "/tmp/workspace",
	});
	const transport: ChatTransport = createChatCallerFactory(router)({});
	const server = createMemoryStreamServer(runtime);
	return { runtime, transport, server };
}

async function idle(runtime: ChatRuntime, sessionId: string): Promise<void> {
	await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");
}

describe("createSessionClient", () => {
	test("prompt, getSession and getItems pagination round trip", async () => {
		const { runtime, transport, server } = startStack();
		const created = await transport.createSession({
			commandId: randomUUID(),
			workspaceId: "workspace-1",
			harness: FAKE_HARNESS,
		});
		const client = createSessionClient({
			sessionId: created.sessionId,
			transport,
			streamBaseUrl: "ws://test/chat-v3",
			createSocket: server.createSocket,
		});

		await client.prompt({
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});
		await idle(runtime, created.sessionId);

		const session = await client.getSession();
		expect(session.session).toMatchObject({ sessionId: created.sessionId });
		expect(session.cursor).toEqual({
			epoch: created.epoch,
			seq: runtime.journal.cursor(created.sessionId).seq,
		});

		const newest = await client.getItems({ limit: 2 });
		expect(newest.ok).toBe(true);
		if (!newest.ok) return;
		expect(newest.envelopes).toHaveLength(2);
		expect(newest.nextBefore).not.toBeNull();

		const older = await client.getItems({
			before: newest.nextBefore ?? undefined,
			limit: 2,
		});
		if (!older.ok) return;
		expect(older.envelopes.at(-1)?.cursor.seq).toBe(
			(newest.nextBefore?.seq ?? 0) - 1,
		);
		await runtime.dispose();
	});

	test("a retried prompt with the same commandId dedupes through the transport", async () => {
		const { runtime, transport, server } = startStack();
		const created = await transport.createSession({
			commandId: randomUUID(),
			workspaceId: "workspace-1",
			harness: FAKE_HARNESS,
		});
		const client = createSessionClient({
			sessionId: created.sessionId,
			transport,
			streamBaseUrl: "ws://test/chat-v3",
			createSocket: server.createSocket,
		});

		const commandId = randomUUID();
		const first = await client.prompt({
			commandId,
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});
		const retried = await client.prompt({
			commandId,
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});
		expect(retried).toEqual(first);
		await idle(runtime, created.sessionId);

		const page = await client.getItems({});
		if (!page.ok) return;
		const userMessages = page.envelopes.filter(
			(envelope) =>
				envelope.event.type === "item" &&
				envelope.event.item.kind === "user_message",
		);
		expect(
			new Set(
				userMessages.map((envelope) =>
					envelope.event.type === "item" ? envelope.event.item.id : "",
				),
			).size,
		).toBe(1);
		await runtime.dispose();
	});

	test("subscribe streams live envelopes and close tears the stream down", async () => {
		const { runtime, transport, server } = startStack();
		const created = await transport.createSession({
			commandId: randomUUID(),
			workspaceId: "workspace-1",
			harness: FAKE_HARNESS,
		});
		const client = createSessionClient({
			sessionId: created.sessionId,
			transport,
			streamBaseUrl: "ws://test/chat-v3",
			createSocket: server.createSocket,
		});

		const received: Envelope[] = [];
		client.subscribe({
			deltas: [],
			onEnvelope: (envelope) => received.push(envelope),
		});

		await client.prompt({
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});
		await idle(runtime, created.sessionId);
		await waitFor(() => received.length >= 4);

		const kinds = received
			.filter(isDurableEnvelope)
			.filter((envelope) => envelope.event.type === "item")
			.map((envelope) =>
				envelope.event.type === "item" ? envelope.event.item.kind : "",
			);
		expect(kinds).toContain("user_message");
		expect(kinds).toContain("agent_message");

		expect(server.openConnections()).toHaveLength(1);
		client.close();
		expect(server.openConnections()).toHaveLength(0);
		await runtime.dispose();
	});
});
