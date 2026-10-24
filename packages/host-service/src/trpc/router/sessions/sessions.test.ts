import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
	type ChatRuntime,
	FakeHarness,
	type HarnessFactoryOptions,
} from "@superset/chat-runtime";
import { createTestRuntime, waitFor } from "@superset/chat-runtime/testing";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { TerminalAgentStore } from "../../../terminal-agents";
import type { HostServiceContext } from "../../../types";
import { sessionsRouter } from "./sessions";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222";
let runtime: ChatRuntime;
let db: HostDb;
let startDead: boolean;
let launches: HarnessFactoryOptions[];
let caller: ReturnType<typeof sessionsRouter.createCaller>;

beforeEach(() => {
	startDead = false;
	launches = [];
	const sqlite = new Database(":memory:");
	db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
	});
	db.insert(schema.projects).values({ id: "project", repoPath: "/repo" }).run();
	for (const id of [WORKSPACE, OTHER_WORKSPACE])
		db.insert(schema.workspaces)
			.values({
				id,
				projectId: "project",
				worktreePath: "/repo",
				branch: "main",
				name: "fixture",
			})
			.run();
	db.insert(schema.hostAgentConfigs)
		.values({
			id: "claude-config",
			presetId: "claude",
			command: "claude",
			promptTransport: "argv",
			label: "Claude",
			displayOrder: 0,
		})
		.run();
	const terminalAgentStore = new TerminalAgentStore();
	runtime = createTestRuntime({
		observer: {
			started: (options) => {
				if (options.terminalId)
					terminalAgentStore.recordChatEvent({
						terminalId: options.terminalId,
						workspaceId: options.scopeId,
						agentId: "claude",
						chatSessionId: options.sessionId,
						eventType: "Stop",
						occurredAt: Date.now(),
					});
			},
			published() {},
			stopped() {},
		},
		harnesses: new Map([
			[
				"claude-acp",
				(options: HarnessFactoryOptions) => {
					launches.push(options);
					return new FakeHarness({
						start: [
							{
								type: "session",
								session: {
									status: startDead ? "dead" : "idle",
									harnessSessionId:
										options.resume?.harnessSessionId ??
										`native-${options.sessionId}`,
								},
							},
						],
						turns: [[], []],
					});
				},
			],
		]),
	});
	const ctx = {
		db,
		runtime: { chat: () => runtime },
		terminalAgentStore,
		isAuthenticated: true,
	} as unknown as HostServiceContext;
	caller = sessionsRouter.createCaller(ctx);
});
afterEach(async () => {
	await runtime.dispose();
});

describe("sessions router", () => {
	test("continues the same conversation for a second config of the provider", async () => {
		db.insert(schema.hostAgentConfigs)
			.values({
				id: "second-claude-config",
				presetId: "claude",
				command: "claude",
				promptTransport: "argv",
				label: "Claude work",
				displayOrder: 1,
			})
			.run();
		const created = await caller.create({
			workspaceId: WORKSPACE,
			agent: "second-claude-config",
		});
		await waitFor(
			() => runtime.live.get(created.sessionId)?.state.status === "idle",
		);
		const continued = await caller.create({
			workspaceId: WORKSPACE,
			agent: "second-claude-config",
			continueSessionId: created.sessionId,
			prompt: "Continue the same work",
		});
		expect(continued.sessionId).toBe(created.sessionId);
		expect(launches).toHaveLength(1);
	});

	test("does not continue or return a dead adapter as a live chat", async () => {
		startDead = true;
		const created = await caller.create({
			workspaceId: WORKSPACE,
			agent: "claude",
		});
		await waitFor(
			() => runtime.live.get(created.sessionId)?.state.status === "dead",
		);
		await expect(
			caller.send({
				workspaceId: WORKSPACE,
				sessionId: created.sessionId,
				prompt: "hello",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		startDead = false;
		const resumed = await caller.resume({
			workspaceId: WORKSPACE,
			sessionId: created.sessionId,
		});
		expect(resumed.sessionId).not.toBe(created.sessionId);
		const continued = await caller.create({
			workspaceId: WORKSPACE,
			agent: "claude",
			continueSessionId: created.sessionId,
			prompt: "continue",
		});
		expect(continued.sessionId).not.toBe(created.sessionId);
	});
	test("rejects unsupported agents without terminal fallback", async () => {
		expect(await caller.capabilities({ agent: "unsupported" })).toEqual({
			supported: false,
		});
		await expect(
			caller.create({ workspaceId: WORKSPACE, agent: "unsupported" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(launches).toHaveLength(0);
	});

	test("creates an ACP session with a real session id and deduplicates the initial prompt", async () => {
		const input = {
			workspaceId: WORKSPACE,
			agent: "claude",
			commandId: crypto.randomUUID(),
			prompt: "Review this change",
		};
		const created = await caller.create(input);
		await waitFor(
			() => runtime.sessions.get(created.sessionId)?.harnessSessionId != null,
		);
		const repeated = await caller.create(input);
		expect(repeated).toEqual(created);
		expect(created.kind).toBe("chat");
		expect(created.terminalId).not.toBe(created.sessionId);
		expect(launches).toHaveLength(1);
		expect(launches[0]?.harness).toBe("claude-acp");
		const page = await caller.read({
			workspaceId: WORKSPACE,
			sessionId: created.sessionId,
		});
		expect(
			page.ok &&
				page.envelopes.filter(
					(entry) =>
						entry.event.type === "item" &&
						entry.event.item.kind === "user_message",
				),
		).toHaveLength(1);
	});

	test("pages read with the before cursor without duplicate or lost events", async () => {
		const created = await caller.create({
			workspaceId: WORKSPACE,
			agent: "claude",
		});
		const input = { workspaceId: WORKSPACE, sessionId: created.sessionId };
		await waitFor(
			() => runtime.live.get(created.sessionId)?.state.status === "idle",
		);
		for (const prompt of ["First", "Second", "Third", "Fourth"]) {
			await caller.send({ ...input, prompt });
		}
		const newest = await caller.read({ ...input, limit: 2 });
		if (!newest.ok || !newest.nextBefore) throw new Error("expected a page");
		const older = await caller.read({
			...input,
			limit: 2,
			before: newest.nextBefore,
		});
		if (!older.ok) throw new Error(older.reset);
		const full = await caller.read(input);
		if (!full.ok) throw new Error(full.reset);
		const seqs = (page: { envelopes: { cursor: { seq: number } }[] }) =>
			page.envelopes.map((entry) => entry.cursor.seq);
		const newestSeq = seqs(newest).at(-1) ?? -1;

		expect(older.nextBefore).toEqual(older.envelopes[0]?.cursor ?? null);
		expect([...seqs(older), ...seqs(newest)]).toEqual(
			seqs(full)
				.filter((seq) => seq <= newestSeq)
				.slice(-4),
		);

		await expect(
			caller.read({
				...input,
				workspaceId: OTHER_WORKSPACE,
				before: newest.nextBefore,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			caller.read({ ...input, before: { epoch: "", seq: -1 } }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("scopes read, send and close to the requested workspace", async () => {
		const created = await caller.create({
			workspaceId: WORKSPACE,
			agent: "claude",
		});
		expect(await caller.list({ workspaceId: OTHER_WORKSPACE })).toEqual([]);
		const input = {
			workspaceId: OTHER_WORKSPACE,
			sessionId: created.sessionId,
		};
		await expect(caller.get(input)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(
			caller.send({ ...input, prompt: "wrong workspace" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(caller.close(input)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(runtime.live.get(created.sessionId)).not.toBeNull();
	});

	test("continues a live chat by session id and resumes a stopped provider conversation", async () => {
		const created = await caller.create({
			workspaceId: WORKSPACE,
			agent: "claude",
		});
		await waitFor(
			() => runtime.sessions.get(created.sessionId)?.status === "idle",
		);
		const continued = await caller.create({
			workspaceId: WORKSPACE,
			agent: "claude",
			continueSessionId: created.sessionId,
			prompt: "Continue",
		});
		expect(continued.sessionId).toBe(created.sessionId);
		expect(launches).toHaveLength(1);
		await caller.close({
			workspaceId: WORKSPACE,
			sessionId: created.sessionId,
		});
		await expect(
			caller.send({
				workspaceId: WORKSPACE,
				sessionId: created.sessionId,
				prompt: "stopped",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const resumed = await caller.resume({
			workspaceId: WORKSPACE,
			sessionId: created.sessionId,
		});
		expect(resumed.sessionId).not.toBe(created.sessionId);
		expect(launches[1]?.resume?.harnessSessionId).toBe(
			`native-${created.sessionId}`,
		);
	});
});
