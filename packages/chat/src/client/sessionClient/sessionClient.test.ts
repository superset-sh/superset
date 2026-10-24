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
	toolCall,
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
		{ type: "turn", turn: turn(turnId) },
		{ type: "item", item: agentMessage(itemId, "done"), turnId },
		{
			type: "turn",
			turn: turn(turnId, { status: "completed", completedAtMs: 2 }),
		},
		{ type: "session", session: { status: "idle" } },
	];
}

const SCRIPT: FakeHarnessScript = {
	turns: [turnScript("t1", "a1"), turnScript("t2", "a2")],
};

function startStack(script: FakeHarnessScript = SCRIPT): {
	runtime: ChatRuntime;
	transport: ChatTransport;
	server: ReturnType<typeof createMemoryStreamServer>;
} {
	const { harnesses } = fakeHarnessRegistry(script);
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
	test("only a client that nests subagents reads a subagent's own items", async () => {
		const { runtime, transport, server } = startStack({
			turns: [
				[
					{ type: "turn", turn: turn("t1") },
					{
						type: "item",
						item: toolCall("subagent:c", { subagent: true }),
						turnId: "t1",
					},
					{
						type: "item",
						item: {
							...agentMessage("sub:c:a", "child"),
							parentItemId: "subagent:c",
						},
						turnId: "t1",
					},
					{
						type: "turn",
						turn: turn("t1", { status: "completed", completedAtMs: 2 }),
					},
					{ type: "session", session: { status: "idle" } },
				],
			],
		});
		const created = await transport.createSession({
			commandId: randomUUID(),
			workspaceId: "workspace-1",
			harness: FAKE_HARNESS,
		});
		const makeClient = (nestedSubagents: boolean) =>
			createSessionClient({
				sessionId: created.sessionId,
				transport,
				streamBaseUrl: "ws://test/chat-v3",
				createSocket: server.createSocket,
				nestedSubagents,
			});
		const nested = makeClient(true);
		const flat = makeClient(false);
		await nested.prompt({
			clientId: "c1",
			content: [{ type: "text", text: "go" }],
		});
		await idle(runtime, created.sessionId);

		const ids = (envelopes: Envelope[]) =>
			envelopes.flatMap((envelope) =>
				isDurableEnvelope(envelope) && envelope.event.type === "item"
					? [envelope.event.item.id]
					: [],
			);
		const nestedPage = await nested.getItems();
		const flatPage = await flat.getItems();
		expect(nestedPage.ok && ids(nestedPage.envelopes)).toContain("sub:c:a");
		expect(flatPage.ok && ids(flatPage.envelopes)).not.toContain("sub:c:a");

		const outlineIds = async (client: typeof flat) => {
			const result = await client.getOutline();
			return result.ok
				? result.outline.items.map((stored) => stored.item.id)
				: [];
		};
		expect(await outlineIds(nested)).toContain("sub:c:a");
		expect(await outlineIds(flat)).not.toContain("sub:c:a");

		const streamed = { nested: [] as Envelope[], flat: [] as Envelope[] };
		nested.subscribe({ onEnvelope: (e) => streamed.nested.push(e) });
		flat.subscribe({ onEnvelope: (e) => streamed.flat.push(e) });
		await waitFor(() => streamed.nested.length > 0 && streamed.flat.length > 0);
		expect(ids(streamed.nested)).toContain("sub:c:a");
		expect(ids(streamed.flat)).not.toContain("sub:c:a");

		nested.close();
		flat.close();
		await runtime.dispose();
	});

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

	test("steerSubagent tells steered, finished and an older host apart", async () => {
		const { runtime, transport, server } = startStack({
			...SCRIPT,
			steerableSubagents: ["subagent:child-1"],
		});
		const created = await transport.createSession({
			commandId: randomUUID(),
			workspaceId: "workspace-1",
			harness: FAKE_HARNESS,
		});
		const makeClient = (clientTransport: ChatTransport) =>
			createSessionClient({
				sessionId: created.sessionId,
				transport: clientTransport,
				streamBaseUrl: "ws://test/chat-v3",
				createSocket: server.createSocket,
			});
		const content = [{ type: "text" as const, text: "more" }];

		const client = makeClient(transport);
		expect(await client.steerSubagent("subagent:child-1", content)).toBe(
			"steered",
		);
		expect(await client.steerSubagent("subagent:child-2", content)).toBe(
			"finished",
		);

		const rejectingSteer = (error: Error): ChatTransport =>
			new Proxy(transport, {
				get: (target, prop, receiver) =>
					prop === "steerSubagent"
						? () => Promise.reject(error)
						: Reflect.get(target, prop, receiver),
			});
		const olderHost = makeClient(
			rejectingSteer(
				new Error('No procedure found on path "chat.steerSubagent"'),
			),
		);
		expect(await olderHost.steerSubagent("subagent:child-1", content)).toBe(
			"unsupported",
		);

		const failing = makeClient(rejectingSteer(new Error("socket closed")));
		await expect(
			failing.steerSubagent("subagent:child-1", content),
		).rejects.toThrow("socket closed");

		client.close();
		await runtime.dispose();
	});

	test("backgroundSubagent tells moved, refused and an older host apart", async () => {
		const { runtime, transport, server } = startStack({
			...SCRIPT,
			backgroundableSubagents: ["subagent:child-1"],
		});
		const created = await transport.createSession({
			commandId: randomUUID(),
			workspaceId: "workspace-1",
			harness: FAKE_HARNESS,
		});
		const makeClient = (clientTransport: ChatTransport) =>
			createSessionClient({
				sessionId: created.sessionId,
				transport: clientTransport,
				streamBaseUrl: "ws://test/chat-v3",
				createSocket: server.createSocket,
			});

		const client = makeClient(transport);
		expect(await client.backgroundSubagent("subagent:child-1")).toBe("moved");
		expect(await client.backgroundSubagent("subagent:child-2")).toBe("refused");

		const rejecting = (error: Error): ChatTransport =>
			new Proxy(transport, {
				get: (target, prop, receiver) =>
					prop === "backgroundSubagent"
						? () => Promise.reject(error)
						: Reflect.get(target, prop, receiver),
			});
		const olderHost = makeClient(
			rejecting(
				new Error('No procedure found on path "chat.backgroundSubagent"'),
			),
		);
		expect(await olderHost.backgroundSubagent("subagent:child-1")).toBe(
			"unsupported",
		);
		const failing = makeClient(rejecting(new Error("socket closed")));
		await expect(
			failing.backgroundSubagent("subagent:child-1"),
		).rejects.toThrow("socket closed");

		client.close();
		await runtime.dispose();
	});
});
