import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wrapHiddenText } from "@superset/chat/protocol";
import type { FakeHarnessScript } from "../../harness/fake";
import type { ChatRuntime } from "../../index";
import { agentMessage, turn } from "../../testing/fixtures";
import { createTestRuntime } from "../../testing/testRuntime";
import {
	FAKE_HARNESS,
	fakeHarnessRegistry,
	journalEnvelopes,
	waitFor,
} from "../../testing/testUtils";
import { createChatCallerFactory, createChatRouter } from "./router";

const SCRIPT: FakeHarnessScript = {
	turns: [
		[
			{ type: "turn", turn: turn("t1") },
			{ type: "item", item: agentMessage("a1", "done"), turnId: "t1" },
			{
				type: "turn",
				turn: turn("t1", { status: "completed", completedAtMs: 2 }),
			},
			{ type: "session", session: { status: "idle" } },
		],
	],
};

function newCaller() {
	const { harnesses, adapters } = fakeHarnessRegistry(SCRIPT);
	const runtime = createTestRuntime({ harnesses });
	const cwd = mkdtempSync(join(tmpdir(), "chat-router-cwd-"));
	const resolvedWorkspaceIds: string[] = [];
	const router = createChatRouter(runtime, {
		resolveCwd: (workspaceId) => {
			resolvedWorkspaceIds.push(workspaceId);
			return cwd;
		},
	});
	const caller = createChatCallerFactory(router)({});
	return {
		runtime,
		caller,
		resolvedWorkspaceIds,
		adapterCount: () => adapters.length,
	};
}

function createSessionInput(workspaceId = "workspace-1") {
	return {
		commandId: randomUUID(),
		workspaceId,
		harness: FAKE_HARNESS,
	};
}

async function promptIdle(
	caller: ReturnType<typeof newCaller>["caller"],
	runtime: ChatRuntime,
	sessionId: string,
): Promise<void> {
	await caller.prompt({
		commandId: randomUUID(),
		sessionId,
		clientId: "client-1",
		content: [{ type: "text", text: "hello" }],
	});
	await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");
}

describe("createChatRouter", () => {
	test("create, prompt and getItems round trip through the router", async () => {
		const { runtime, caller, resolvedWorkspaceIds } = newCaller();
		const created = await caller.createSession(createSessionInput());
		expect(created.sessionId).toMatch(/^[0-9a-f-]{36}$/);
		expect(resolvedWorkspaceIds).toEqual(["workspace-1"]);

		await promptIdle(caller, runtime, created.sessionId);

		const page = await caller.getItems({ sessionId: created.sessionId });
		expect(page.ok).toBe(true);
		if (!page.ok) return;
		const itemKinds = page.envelopes
			.filter((envelope) => envelope.event.type === "item")
			.map((envelope) =>
				envelope.event.type === "item" ? envelope.event.item.kind : "",
			);
		expect(itemKinds).toContain("user_message");
		expect(itemKinds).toContain("agent_message");

		const session = await caller.getSession({ sessionId: created.sessionId });
		expect(session.session).toMatchObject({ sessionId: created.sessionId });
		expect(session.cursor).toEqual({
			epoch: created.epoch,
			seq: runtime.journal.cursor(created.sessionId).seq,
		});
		await runtime.dispose();
	});

	test("invalid input is rejected by the zod schemas", async () => {
		const { runtime, caller } = newCaller();
		const created = await caller.createSession(createSessionInput());

		await expect(
			caller.createSession({
				commandId: randomUUID(),
				workspaceId: "",
				harness: FAKE_HARNESS,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		await expect(
			caller.prompt({
				commandId: "not-a-uuid",
				sessionId: created.sessionId,
				clientId: "client-1",
				content: [{ type: "text", text: "hi" }],
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		await expect(
			caller.prompt({
				commandId: randomUUID(),
				sessionId: created.sessionId,
				clientId: "client-1",
				content: [],
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		await expect(
			caller.getItems({ sessionId: created.sessionId, limit: 0 }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await runtime.dispose();
	});

	test("command errors surface as typed tRPC errors", async () => {
		const { runtime, caller } = newCaller();

		await expect(
			caller.createSession({
				commandId: randomUUID(),
				workspaceId: "workspace-1",
				harness: "nope",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		await expect(
			caller.prompt({
				commandId: randomUUID(),
				sessionId: "missing",
				clientId: "client-1",
				content: [{ type: "text", text: "hi" }],
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });

		await expect(
			caller.rewindSession({
				commandId: randomUUID(),
				sessionId: "missing",
				itemId: "item-1",
				prompt: "edited",
				workspaceId: "workspace-1",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });

		const created = await caller.createSession(createSessionInput());
		await runtime.live.dispose(created.sessionId);
		await expect(
			caller.prompt({
				commandId: randomUUID(),
				sessionId: created.sessionId,
				clientId: "client-1",
				content: [{ type: "text", text: "hi" }],
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await runtime.dispose();
	});

	test("a retried commandId dedupes through the router", async () => {
		const { runtime, caller, adapterCount } = newCaller();
		const input = createSessionInput();
		const first = await caller.createSession(input);
		const second = await caller.createSession(input);

		expect(second).toEqual(first);
		expect(adapterCount()).toBe(1);
		expect(await caller.listSessions({})).toHaveLength(1);

		const promptInput = {
			commandId: randomUUID(),
			sessionId: first.sessionId,
			clientId: "client-1",
			content: [{ type: "text" as const, text: "hello" }],
		};
		const promptResult = await caller.prompt(promptInput);
		const retried = await caller.prompt(promptInput);
		expect(retried).toEqual(promptResult);

		await waitFor(
			() => runtime.sessions.get(first.sessionId)?.status === "idle",
		);
		const userMessages = journalEnvelopes(runtime, first.sessionId).filter(
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

	test("listSessions filters by workspace and honours the limit", async () => {
		const { runtime, caller } = newCaller();
		await caller.createSession(createSessionInput("workspace-1"));
		await caller.createSession(createSessionInput("workspace-2"));

		expect(await caller.listSessions({})).toHaveLength(2);
		expect(
			await caller.listSessions({ workspaceId: "workspace-2" }),
		).toHaveLength(1);
		expect(await caller.listSessions({ limit: 1 })).toHaveLength(1);
		await runtime.dispose();
	});

	test("steerSubagent routes to the live session", async () => {
		const { harnesses, adapters } = fakeHarnessRegistry({
			...SCRIPT,
			steerableSubagents: ["subagent:child-1"],
		});
		const runtime = createTestRuntime({ harnesses });
		const caller = createChatCallerFactory(
			createChatRouter(runtime, {
				resolveCwd: () => mkdtempSync(join(tmpdir(), "chat-router-cwd-")),
			}),
		)({});
		const created = await caller.createSession(createSessionInput());
		const content = [{ type: "text" as const, text: "check the tests too" }];

		expect(
			await caller.steerSubagent({
				commandId: randomUUID(),
				sessionId: created.sessionId,
				taskId: "subagent:child-1",
				content,
			}),
		).toEqual({ result: "steered" });
		expect(
			await caller.steerSubagent({
				commandId: randomUUID(),
				sessionId: created.sessionId,
				taskId: "subagent:child-2",
				content,
			}),
		).toEqual({ result: "finished" });
		await caller.steerSubagent({
			commandId: randomUUID(),
			sessionId: created.sessionId,
			taskId: "subagent:child-1",
			content: [
				{ type: "text", text: "use the server" },
				{ type: "text", text: "MCP server: linear", hidden: true },
			],
		});
		expect(adapters[0]?.steeredSubagents).toEqual([
			{ taskId: "subagent:child-1", content },
			{
				taskId: "subagent:child-1",
				content: [
					{ type: "text", text: "use the server" },
					{ type: "text", text: wrapHiddenText("MCP server: linear") },
				],
			},
		]);
		await expect(
			caller.steerSubagent({
				commandId: randomUUID(),
				sessionId: created.sessionId,
				taskId: "subagent:child-1",
				content: [],
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await runtime.dispose();
	});

	test("backgroundSubagent routes to the live session", async () => {
		const { harnesses, adapters } = fakeHarnessRegistry({
			...SCRIPT,
			backgroundableSubagents: ["subagent:child-1"],
		});
		const runtime = createTestRuntime({ harnesses });
		const caller = createChatCallerFactory(
			createChatRouter(runtime, {
				resolveCwd: () => mkdtempSync(join(tmpdir(), "chat-router-cwd-")),
			}),
		)({});
		const created = await caller.createSession(createSessionInput());

		expect(
			await caller.backgroundSubagent({
				commandId: randomUUID(),
				sessionId: created.sessionId,
				taskId: "subagent:child-1",
			}),
		).toEqual({ result: "moved" });
		expect(
			await caller.backgroundSubagent({
				commandId: randomUUID(),
				sessionId: created.sessionId,
				taskId: "subagent:child-2",
			}),
		).toEqual({ result: "refused" });
		expect(adapters[0]?.backgroundedSubagents).toEqual(["subagent:child-1"]);
		await runtime.dispose();
	});

	test("discoverSessions reports an unknown harness", async () => {
		const { runtime, caller } = newCaller();
		await expect(
			caller.discoverSessions({
				workspaceId: "workspace-1",
				harness: "nope",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "unknown harness nope",
		});
		await runtime.dispose();
	});
});
