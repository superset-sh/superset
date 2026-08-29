import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { getPresetById } from "@superset/shared/host-agent-presets";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import {
	hostAgentConfigs,
	terminalAgentBindings,
	terminalSessions,
} from "../../../db/schema";
import {
	SqliteTerminalAgentBindingPersistence,
	TerminalAgentStore,
} from "../../../terminal-agents";
import type { HostServiceContext } from "../../../types";
import { buildTerminalAgentLaunch } from "../agents/agents";
import { notificationsRouter } from "../notifications/notifications";
import { getTerminalAgentSession } from "./terminal-agents";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const WORKSPACE_ID = "ws-identity";

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	return db as unknown as HostDb;
}

/**
 * Seed the agent exactly as a host seeds itself on first boot — the real
 * builtin preset, including the real `resumeArgs` the provider needs.
 */
function seedPreset(db: HostDb, presetId: string, order: number): void {
	const preset = getPresetById(presetId);
	if (!preset) throw new Error(`no builtin preset ${presetId}`);
	db.insert(hostAgentConfigs)
		.values({
			id: `cfg-${presetId}`,
			presetId: preset.presetId,
			label: preset.label,
			command: preset.command,
			argsJson: JSON.stringify(preset.args),
			promptTransport: preset.promptTransport,
			promptArgsJson: JSON.stringify(preset.promptArgs),
			resumeArgsJson: JSON.stringify(preset.resumeArgs),
			envJson: "{}",
			displayOrder: order,
		})
		.run();
}

function seedTerminal(db: HostDb, terminalId: string): void {
	db.insert(terminalSessions)
		.values({
			id: terminalId,
			status: "active",
			originWorkspaceId: WORKSPACE_ID,
			createdAt: 1,
		})
		.run();
}

interface Harness {
	db: HostDb;
	store: TerminalAgentStore;
	/** POST a lifecycle event the way the in-shell notify hook does. */
	hook(input: {
		terminalId: string;
		eventType: string;
		agentId?: string;
		sessionId?: string;
	}): Promise<unknown>;
}

function createHarness(): Harness {
	const db = createTestDb();
	const store = new TerminalAgentStore(
		new SqliteTerminalAgentBindingPersistence(db),
	);
	const ctx = {
		db,
		api: { task: { start: { mutate: async () => ({}) } } },
		eventBus: { broadcastAgentLifecycle: () => {} },
		terminalAgentStore: store,
	} as unknown as HostServiceContext;
	const caller = notificationsRouter.createCaller(ctx);

	return {
		db,
		store,
		hook: ({ terminalId, eventType, agentId, sessionId }) =>
			caller.hook({
				terminalId,
				eventType,
				...(agentId ? { agent: { agentId, sessionId } } : {}),
			}),
	};
}

function get(db: HostDb, terminalId: string, workspaceId = WORKSPACE_ID) {
	return getTerminalAgentSession(db, { workspaceId, terminalId });
}

/**
 * The two providers the issue names, with the id shape each one actually
 * reports (a Claude session uuid, a Codex thread id) and the resume contract
 * each declares in its builtin preset.
 */
const PROVIDERS: Array<{
	presetId: string;
	providerSessionId: string;
	resumeFlag: string;
}> = [
	{
		presetId: "claude",
		providerSessionId: "3f9c1d42-0b7c-4a11-9f2e-6d8a0c5e7b13",
		resumeFlag: "'--resume'",
	},
	{
		presetId: "codex",
		providerSessionId: "0199a4f1-thread-2f6b",
		resumeFlag: "'resume'",
	},
];

describe.each(PROVIDERS)("$presetId agent session identity round trip", ({
	presetId,
	providerSessionId,
	resumeFlag,
}) => {
	const terminalId = `term-${presetId}`;

	function boot(): Harness {
		const harness = createHarness();
		seedPreset(harness.db, presetId, 0);
		seedTerminal(harness.db, terminalId);
		return harness;
	}

	it("reports the terminal with no agent before any hook lands", () => {
		const { db } = boot();
		expect(get(db, terminalId)).toEqual({
			kind: "terminal",
			terminalId,
			workspaceId: WORKSPACE_ID,
			terminalStatus: "active",
			agent: null,
		});
	});

	it("is not resumable on attach alone — no conversation exists yet", async () => {
		const harness = boot();
		await harness.hook({
			terminalId,
			eventType: "SessionStart",
			agentId: presetId,
			sessionId: providerSessionId,
		});

		const session = get(harness.db, terminalId);
		expect(session?.agent).toMatchObject({
			presetId,
			sessionId: providerSessionId,
			state: "idle",
			resumable: false,
			ended: false,
		});
	});

	it("separates terminal identity from the provider conversation id", async () => {
		const harness = boot();
		await harness.hook({
			terminalId,
			eventType: "UserPromptSubmit",
			agentId: presetId,
			sessionId: providerSessionId,
		});

		const session = get(harness.db, terminalId);
		expect(session?.terminalId).toBe(terminalId);
		expect(session?.agent?.sessionId).toBe(providerSessionId);
		expect(session?.agent?.sessionId).not.toBe(session?.terminalId);
		expect(session?.agent).toMatchObject({
			presetId,
			state: "working",
			resumable: true,
		});
		expect(session?.agent?.lastEventAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
	});

	it("does not report a working agent once the provider exits under an open PTY", async () => {
		const harness = boot();
		await harness.hook({
			terminalId,
			eventType: "UserPromptSubmit",
			agentId: presetId,
			sessionId: providerSessionId,
		});
		expect(get(harness.db, terminalId)?.agent?.state).toBe("working");

		// The provider says goodbye; nobody closed the shell.
		await harness.hook({
			terminalId,
			eventType: "SessionEnd",
			agentId: presetId,
			sessionId: providerSessionId,
		});

		const session = get(harness.db, terminalId);
		expect(session?.terminalStatus).toBe("active");
		expect(session?.agent).toMatchObject({
			state: "ended",
			ended: true,
			endReason: "detached",
		});
		expect(session?.agent?.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("still serves the binding after the terminal itself died", async () => {
		const harness = boot();
		await harness.hook({
			terminalId,
			eventType: "Stop",
			agentId: presetId,
			sessionId: providerSessionId,
		});
		harness.store.markTerminalExited(terminalId);
		harness.db
			.update(terminalSessions)
			.set({ status: "exited" })
			.where(eq(terminalSessions.id, terminalId))
			.run();

		const session = get(harness.db, terminalId);
		expect(session?.terminalStatus).toBe("exited");
		expect(session?.agent).toMatchObject({
			sessionId: providerSessionId,
			state: "ended",
			ended: true,
			endReason: "terminal-exited",
			resumable: true,
		});
	});

	it("round-trips the reported id back through a resume launch", async () => {
		const harness = boot();
		await harness.hook({
			terminalId,
			eventType: "Stop",
			agentId: presetId,
			sessionId: providerSessionId,
		});
		await harness.hook({
			terminalId,
			eventType: "SessionEnd",
			agentId: presetId,
			sessionId: providerSessionId,
		});

		const parked = get(harness.db, terminalId)?.agent;
		expect(parked?.resumable).toBe(true);

		// Exactly what `agents create --resume-session <id>` does with it.
		const launch = buildTerminalAgentLaunch(harness.db, {
			workspaceId: WORKSPACE_ID,
			agent: parked?.presetId ?? "",
			prompt: "",
			resumeSessionId: parked?.sessionId ?? "",
		});
		expect(launch.presetId).toBe(presetId);
		expect(launch.fullCommand).toContain(
			`${resumeFlag} '${providerSessionId}'`,
		);
	});

	it("describes a launch whose binding has not landed yet as starting", () => {
		const { db } = boot();
		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: WORKSPACE_ID,
			agent: presetId,
			prompt: "go",
		});
		expect(launch.presetId).toBe(presetId);
		expect(launch.resumeArgs.length).toBeGreaterThan(0);
	});
});

describe("getTerminalAgentSession", () => {
	it("reports resumable false for a provider with no resume contract", async () => {
		const harness = createHarness();
		harness.db
			.insert(hostAgentConfigs)
			.values({
				id: "cfg-noresume",
				presetId: "claude",
				label: "Claude (no resume)",
				command: "claude",
				argsJson: "[]",
				promptTransport: "argv",
				promptArgsJson: "[]",
				resumeArgsJson: "[]",
				envJson: "{}",
				displayOrder: 0,
			})
			.run();
		seedTerminal(harness.db, "term-noresume");
		await harness.hook({
			terminalId: "term-noresume",
			eventType: "Stop",
			agentId: "claude",
			sessionId: "sess-noresume",
		});

		expect(get(harness.db, "term-noresume")?.agent).toMatchObject({
			sessionId: "sess-noresume",
			resumable: false,
		});
	});

	it("does not serve another workspace's terminal", async () => {
		const harness = createHarness();
		seedPreset(harness.db, "claude", 0);
		seedTerminal(harness.db, "term-scope");
		await harness.hook({
			terminalId: "term-scope",
			eventType: "Stop",
			agentId: "claude",
			sessionId: "sess-scope",
		});

		expect(get(harness.db, "term-scope", "ws-other")).toBeNull();
	});

	it("returns null for a terminal this host never had", () => {
		const harness = createHarness();
		expect(get(harness.db, "term-missing")).toBeNull();
	});

	it("serves a binding whose terminal row is already gone", async () => {
		const harness = createHarness();
		seedPreset(harness.db, "claude", 0);
		seedTerminal(harness.db, "term-gone");
		await harness.hook({
			terminalId: "term-gone",
			eventType: "Stop",
			agentId: "claude",
			sessionId: "sess-gone",
		});
		harness.store.markTerminalExited("term-gone");
		harness.db
			.delete(terminalSessions)
			.where(eq(terminalSessions.id, "term-gone"))
			.run();

		const session = get(harness.db, "term-gone");
		expect(session?.terminalStatus).toBeNull();
		expect(session?.agent).toMatchObject({
			sessionId: "sess-gone",
			state: "ended",
		});
	});

	it("keeps the binding readable after a hook-less agent leaves a row behind", () => {
		const harness = createHarness();
		seedPreset(harness.db, "claude", 0);
		seedTerminal(harness.db, "term-raw");
		harness.db
			.insert(terminalAgentBindings)
			.values({
				terminalId: "term-raw",
				workspaceId: WORKSPACE_ID,
				agentId: "claude",
				agentSessionId: "sess-raw",
				startedAt: 1_700_000_000_000,
				lastEventAt: 1_700_000_001_000,
				lastEventType: "Stop",
				endedAt: 1_700_000_002_000,
				endReason: "disposed",
			})
			.run();

		expect(get(harness.db, "term-raw")?.agent).toEqual({
			presetId: "claude",
			sessionId: "sess-raw",
			resumable: true,
			state: "ended",
			lastEventType: "Stop",
			lastEventAt: "2023-11-14T22:13:21.000Z",
			startedAt: "2023-11-14T22:13:20.000Z",
			ended: true,
			endedAt: "2023-11-14T22:13:22.000Z",
			endReason: "disposed",
		});
	});
});
