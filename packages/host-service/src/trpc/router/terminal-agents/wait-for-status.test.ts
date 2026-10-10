import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { terminalAgentBindings, terminalSessions } from "../../../db/schema";
import type { EventBus, TerminalLifecycleEvent } from "../../../events";
import {
	SqliteTerminalAgentBindingPersistence,
	TerminalAgentStore,
} from "../../../terminal-agents";
import { markTerminalAgentBindingEnded } from "../../../terminal-agents/persistence";
import {
	snapshotTerminalAgent,
	terminalAgentWaitStatus,
	waitForTerminalAgentStatus,
} from "./wait-for-status";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function seedTerminalSession(db: HostDb, terminalId: string) {
	db.insert(terminalSessions)
		.values({
			id: terminalId,
			status: "active",
			originWorkspaceId: "ws-1",
			createdAt: 1,
		})
		.run();
}

function createHarness() {
	const db = createTestDb();
	seedTerminalSession(db, "t1");
	const store = new TerminalAgentStore(
		new SqliteTerminalAgentBindingPersistence(db),
	);
	const lifecycleListeners = new Set<(event: TerminalLifecycleEvent) => void>();
	const eventBus: Pick<EventBus, "onTerminalLifecycle"> = {
		onTerminalLifecycle(listener) {
			lifecycleListeners.add(listener);
			return () => lifecycleListeners.delete(listener);
		},
	};
	const record = (eventType: string, occurredAt: number) =>
		store.recordEvent({
			terminalId: "t1",
			workspaceId: "ws-1",
			eventType,
			agentId: "claude",
			agentSessionId: "sess-t1",
			occurredAt,
		});
	const ptyExited = (occurredAt: number) => {
		// What terminal.ts does on PTY exit: a direct row stamp, then a
		// lifecycle broadcast. The store never hears about it.
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited", occurredAt);
		for (const listener of lifecycleListeners) {
			listener({
				workspaceId: "ws-1",
				terminalId: "t1",
				eventType: "exit",
				exitCode: 0,
				signal: 0,
				occurredAt,
			});
		}
	};
	return { db, store, eventBus, lifecycleListeners, record, ptyExited };
}

const target = { workspaceId: "ws-1", terminalId: "t1" } as const;
const afterTick = (fn: () => void) => setTimeout(fn, 5);

describe("terminalAgentWaitStatus", () => {
	const base = {
		terminalId: "t1",
		workspaceId: "ws-1",
		agentId: "claude" as const,
		startedAt: 1,
		lastEventAt: 2,
	};

	it.each([
		["Start", "working"],
		["PermissionRequest", "permission"],
		["Failed", "failed"],
		["Stop", "idle"],
		["Attached", "attached"],
	] as const)("derives %s to %s", (lastEventType, status) => {
		expect(terminalAgentWaitStatus({ ...base, lastEventType })).toBe(status);
	});

	it("reports a persisted ended row as ended whatever its last event was", () => {
		expect(
			terminalAgentWaitStatus({
				...base,
				lastEventType: "Start",
				endedAt: 3,
				endReason: "terminal-exited",
			}),
		).toBe("ended");
	});
});

describe("snapshotTerminalAgent", () => {
	it("is null for a terminal no agent ever reported from", () => {
		const { db, store, eventBus } = createHarness();
		expect(
			snapshotTerminalAgent(
				{ db, terminalAgentStore: store, eventBus },
				{ workspaceId: "ws-1", terminalId: "plain-shell" },
			),
		).toBeNull();
	});

	it("does not answer for a binding that belongs to another workspace", () => {
		const { db, store, eventBus, record } = createHarness();
		record("Stop", 1_000);
		expect(
			snapshotTerminalAgent(
				{ db, terminalAgentStore: store, eventBus },
				{ workspaceId: "ws-other", terminalId: "t1" },
			),
		).toBeNull();
	});

	it("measures sinceMs from the end time once the row is ended", () => {
		const { db, store, eventBus, record, ptyExited } = createHarness();
		record("Start", 1_000);
		ptyExited(5_000);
		const snapshot = snapshotTerminalAgent(
			{ db, terminalAgentStore: store, eventBus },
			target,
			6_000,
		);
		expect(snapshot).toMatchObject({
			status: "ended",
			observedAt: 5_000,
			sinceMs: 1_000,
			binding: { endedAt: 5_000, endReason: "terminal-exited" },
		});
	});
});

describe("waitForTerminalAgentStatus", () => {
	it("rejects with NOT_FOUND instead of waiting when the terminal is not in the workspace", async () => {
		const { db, store, eventBus } = createHarness();
		await expect(
			waitForTerminalAgentStatus(
				{ db, terminalAgentStore: store, eventBus },
				{
					workspaceId: "ws-1",
					terminalId: "no-such-terminal",
					until: ["idle"],
					timeoutMs: 10_000,
				},
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(store.listenerCount("change")).toBe(0);
	});

	it("waits on a just-launched terminal through attached and working until its first turn stops", async () => {
		const { db, store, eventBus, record } = createHarness();

		const seen: string[] = [];
		const pending = waitForTerminalAgentStatus(
			{ db, terminalAgentStore: store, eventBus },
			{ ...target, until: ["idle"], timeoutMs: 10_000 },
		).then((result) => {
			seen.push(result.status);
			return result;
		});

		record("Attached", 1_000);
		await new Promise((r) => setTimeout(r, 20));
		expect(seen).toEqual([]);
		record("Start", 2_000);
		await new Promise((r) => setTimeout(r, 20));
		expect(seen).toEqual([]);
		record("Stop", 3_000);

		const result = await pending;
		expect(result.status).toBe("idle");
		expect(result.binding.lastEventAt).toBe(3_000);
		expect(store.listenerCount("change")).toBe(0);
	});

	it("names the missing agent when a shell with no agent times out", async () => {
		const { db, store, eventBus } = createHarness();
		await expect(
			waitForTerminalAgentStatus(
				{ db, terminalAgentStore: store, eventBus },
				{ ...target, until: ["idle"], timeoutMs: 30 },
			),
		).rejects.toMatchObject({
			code: "TIMEOUT",
			message:
				"Timed out after 30ms waiting for terminal t1 to reach one of: idle (no agent has reported from it)",
		});
	});

	it("resolves at once when the status already matches and no watermark is given", async () => {
		const { db, store, eventBus, record } = createHarness();
		record("Stop", 1_000);

		const result = await waitForTerminalAgentStatus(
			{ db, terminalAgentStore: store, eventBus },
			{ ...target, until: ["idle", "ended"], timeoutMs: 10_000 },
		);

		expect(result.status).toBe("idle");
		expect(result.binding.terminalId).toBe("t1");
		expect(store.listenerCount("change")).toBe(0);
	});

	it("with a watermark, ignores the idle recorded before a prompt and resolves only after Start then Stop", async () => {
		const { db, store, eventBus, record } = createHarness();
		record("Stop", 1_000);
		const preSend = snapshotTerminalAgent(
			{ db, terminalAgentStore: store, eventBus },
			target,
		);
		if (!preSend) throw new Error("binding missing");
		expect(preSend.status).toBe("idle");

		const seen: string[] = [];
		const pending = waitForTerminalAgentStatus(
			{ db, terminalAgentStore: store, eventBus },
			{
				...target,
				until: ["idle"],
				timeoutMs: 10_000,
				after: preSend.binding.lastEventAt,
			},
		).then((result) => {
			seen.push("resolved");
			return result;
		});

		// The agent's Start hook posts: still working, must not resolve.
		record("Start", 2_000);
		await new Promise((r) => setTimeout(r, 20));
		expect(seen).toEqual([]);

		record("Stop", 3_000);
		const result = await pending;

		expect(result.status).toBe("idle");
		expect(result.binding.lastEventAt).toBe(3_000);
		expect(result.observedAt).toBeGreaterThan(preSend.binding.lastEventAt);
		expect(store.listenerCount("change")).toBe(0);
	});

	it("with a watermark, a cleared status is not a completion", async () => {
		const { db, store, eventBus, record } = createHarness();
		record("Start", 1_000);

		const pending = waitForTerminalAgentStatus(
			{ db, terminalAgentStore: store, eventBus },
			{ ...target, until: ["idle"], timeoutMs: 60, after: 1_000 },
		);
		afterTick(() => store.clearWorkspaceStatuses("ws-1", "t1"));

		await expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
		expect(store.listenerCount("change")).toBe(0);
	});

	it("keeps waiting through events outside the target set", async () => {
		const { db, store, eventBus, record } = createHarness();
		record("Start", 1_000);

		const pending = waitForTerminalAgentStatus(
			{ db, terminalAgentStore: store, eventBus },
			{ ...target, until: ["idle", "permission"], timeoutMs: 10_000 },
		);
		record("Start", 1_500);
		afterTick(() => record("PermissionRequest", 2_000));

		const result = await pending;
		expect(result.status).toBe("permission");
		expect(result.binding.lastEventType).toBe("PermissionRequest");
		expect(store.listenerCount("change")).toBe(0);
	});

	it("rejects with TIMEOUT once the deadline passes without a match", async () => {
		const { db, store, eventBus, record } = createHarness();
		record("Start", 1_000);

		const startedAt = performance.now();
		await expect(
			waitForTerminalAgentStatus(
				{ db, terminalAgentStore: store, eventBus },
				{ ...target, until: ["idle"], timeoutMs: 50 },
			),
		).rejects.toMatchObject({
			code: "TIMEOUT",
			message:
				"Timed out after 50ms waiting for terminal t1 to reach one of: idle (last status: working)",
		});
		expect(performance.now() - startedAt).toBeGreaterThanOrEqual(40);
		expect(store.listenerCount("change")).toBe(0);
	});

	it("resolves a wait for ended when the PTY dies under the agent, which bypasses the store", async () => {
		const { db, store, eventBus, lifecycleListeners, record, ptyExited } =
			createHarness();
		record("Start", 1_000);

		const pending = waitForTerminalAgentStatus(
			{ db, terminalAgentStore: store, eventBus },
			{ ...target, until: ["ended"], timeoutMs: 10_000, after: 1_000 },
		);
		afterTick(() => ptyExited(5_000));

		const result = await pending;
		expect(result).toMatchObject({
			status: "ended",
			observedAt: 5_000,
			binding: { endedAt: 5_000, endReason: "terminal-exited" },
		});
		expect(store.get("t1")).toBeUndefined();
		expect(lifecycleListeners.size).toBe(0);
		expect(store.listenerCount("change")).toBe(0);
	});

	it("still notices an end written to the row with no event at all", async () => {
		const { db, store, eventBus, record } = createHarness();
		record("Start", 1_000);

		const pending = waitForTerminalAgentStatus(
			{ db, terminalAgentStore: store, eventBus, endWritePollMs: 10 },
			{ ...target, until: ["ended"], timeoutMs: 10_000 },
		);
		afterTick(() =>
			markTerminalAgentBindingEnded(db, "t1", "terminal-exited", 5_000),
		);

		const result = await pending;
		expect(result.status).toBe("ended");
		expect(store.listenerCount("change")).toBe(0);
	});

	it("rejects with NOT_FOUND when the terminal is deleted under the wait", async () => {
		const { db, store, eventBus, record } = createHarness();
		record("Start", 1_000);

		const pending = waitForTerminalAgentStatus(
			{ db, terminalAgentStore: store, eventBus, endWritePollMs: 10 },
			{ ...target, until: ["idle"], timeoutMs: 10_000 },
		);
		afterTick(() => {
			db.delete(terminalAgentBindings)
				.where(eq(terminalAgentBindings.terminalId, "t1"))
				.run();
			db.delete(terminalSessions).where(eq(terminalSessions.id, "t1")).run();
			store.markTerminalDisposed("t1");
		});

		await expect(pending).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: "Terminal t1 is gone from workspace ws-1",
		});
		expect(store.listenerCount("change")).toBe(0);
	});

	it("stops waiting and cleans up when the caller aborts", async () => {
		const { db, store, eventBus, lifecycleListeners, record } = createHarness();
		record("Start", 1_000);
		const controller = new AbortController();

		const pending = waitForTerminalAgentStatus(
			{ db, terminalAgentStore: store, eventBus },
			{
				...target,
				until: ["idle"],
				timeoutMs: 10_000,
				signal: controller.signal,
			},
		);
		afterTick(() => controller.abort());

		await expect(pending).rejects.toMatchObject({
			code: "CLIENT_CLOSED_REQUEST",
		});
		expect(store.listenerCount("change")).toBe(0);
		expect(lifecycleListeners.size).toBe(0);
	});
});
