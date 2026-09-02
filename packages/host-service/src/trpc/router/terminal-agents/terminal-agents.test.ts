import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
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
	type TerminalAgentId,
	TerminalAgentStore,
} from "../../../terminal-agents";
import { findResumeCandidateBinding } from "../../../terminal-agents/persistence";
import type { AgentRunResult } from "../agents/agents";
import {
	listAccountRestartCandidates,
	type RestartAccountSessionsDeps,
	type ResumeSessionDeps,
	restartAccountSessions,
	resumeTerminalAgentSession,
} from "./terminal-agents";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

const CLAUDE_CONFIG_ID = "00000000-0000-0000-0000-000000000001";

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	return db as unknown as HostDb;
}

function seedResumableBinding(
	db: HostDb,
	{ terminalId = "t1", resumeArgs = ["--resume"] } = {},
) {
	db.insert(hostAgentConfigs)
		.values({
			id: CLAUDE_CONFIG_ID,
			presetId: "claude",
			label: "Claude",
			command: "claude",
			promptTransport: "argv",
			resumeArgsJson: JSON.stringify(resumeArgs),
			displayOrder: 0,
		})
		.run();
	db.insert(terminalSessions)
		.values({
			id: terminalId,
			status: "exited",
			originWorkspaceId: "ws-1",
			createdAt: 1,
		})
		.run();
	db.insert(terminalAgentBindings)
		.values({
			terminalId,
			workspaceId: "ws-1",
			agentId: "claude",
			agentSessionId: `sess-${terminalId}`,
			startedAt: 1,
			lastEventAt: 2,
			lastEventType: "Stop",
			endedAt: 3,
			endReason: "terminal-exited",
		})
		.run();
}

interface DepsHarness {
	deps: ResumeSessionDeps;
	runCalls: Array<Parameters<ResumeSessionDeps["runAgent"]>[0]>;
	disposedTerminals: string[];
}

function createDeps(
	db: HostDb,
	runAgent?: ResumeSessionDeps["runAgent"],
): DepsHarness {
	const runCalls: DepsHarness["runCalls"] = [];
	const disposedTerminals: string[] = [];
	const deps: ResumeSessionDeps = {
		db,
		terminalAgentStore: new TerminalAgentStore(
			new SqliteTerminalAgentBindingPersistence(db),
		),
		runAgent: (input) => {
			runCalls.push(input);
			if (runAgent) return runAgent(input);
			return Promise.resolve({
				kind: "terminal",
				sessionId: "t-new",
				label: "Claude",
			} satisfies AgentRunResult);
		},
		disposeSession: (terminalId) => {
			disposedTerminals.push(terminalId);
			return Promise.resolve();
		},
	};
	return { deps, runCalls, disposedTerminals };
}

describe("resumeTerminalAgentSession", () => {
	it("claims, relaunches with the saved session id, and disposes the dead terminal", async () => {
		const db = createTestDb();
		seedResumableBinding(db);
		const { deps, runCalls, disposedTerminals } = createDeps(db);

		const result = await resumeTerminalAgentSession(deps, {
			workspaceId: "ws-1",
			terminalId: "t1",
		});

		expect(result).toEqual({
			resumed: true,
			terminalId: "t-new",
			label: "Claude",
		});
		expect(runCalls).toEqual([
			{
				workspaceId: "ws-1",
				agent: CLAUDE_CONFIG_ID,
				prompt: "",
				resumeSessionId: "sess-t1",
			},
		]);
		expect(disposedTerminals).toEqual(["t1"]);
		// The candidate is consumed for good.
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
	});

	it("is idempotent: a repeat call after success launches nothing", async () => {
		const db = createTestDb();
		seedResumableBinding(db);
		const { deps, runCalls } = createDeps(db);

		const first = await resumeTerminalAgentSession(deps, {
			workspaceId: "ws-1",
			terminalId: "t1",
		});
		const second = await resumeTerminalAgentSession(deps, {
			workspaceId: "ws-1",
			terminalId: "t1",
		});

		expect(first.resumed).toBe(true);
		expect(second).toEqual({ resumed: false });
		expect(runCalls).toHaveLength(1);
	});

	it("coalesces concurrent callers onto one launch, all sharing its result", async () => {
		const db = createTestDb();
		seedResumableBinding(db);
		let releaseLaunch = () => {};
		const gate = new Promise<void>((resolveGate) => {
			releaseLaunch = resolveGate;
		});
		const { deps, runCalls } = createDeps(db, async () => {
			await gate;
			return { kind: "terminal", sessionId: "t-new", label: "Claude" };
		});

		const input = { workspaceId: "ws-1", terminalId: "t1" };
		const a = resumeTerminalAgentSession(deps, input);
		const b = resumeTerminalAgentSession(deps, input);
		releaseLaunch();

		const [resultA, resultB] = await Promise.all([a, b]);
		expect(resultA).toEqual({
			resumed: true,
			terminalId: "t-new",
			label: "Claude",
		});
		expect(resultB).toEqual(resultA);
		expect(runCalls).toHaveLength(1);
	});

	it("un-claims on launch failure so a retry can succeed", async () => {
		const db = createTestDb();
		seedResumableBinding(db);
		let failNext = true;
		const { deps, runCalls, disposedTerminals } = createDeps(db, () => {
			if (failNext) {
				failNext = false;
				return Promise.reject(new Error("spawn failed"));
			}
			return Promise.resolve({
				kind: "terminal",
				sessionId: "t-new",
				label: "Claude",
			});
		});

		const input = { workspaceId: "ws-1", terminalId: "t1" };
		await expect(resumeTerminalAgentSession(deps, input)).rejects.toThrow(
			"spawn failed",
		);
		expect(disposedTerminals).toEqual([]);
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeDefined();

		const retried = await resumeTerminalAgentSession(deps, input);
		expect(retried.resumed).toBe(true);
		expect(runCalls).toHaveLength(2);
	});

	it("returns resumed: false without launching when there is no candidate", async () => {
		const db = createTestDb();
		const { deps, runCalls } = createDeps(db);

		const result = await resumeTerminalAgentSession(deps, {
			workspaceId: "ws-1",
			terminalId: "t-missing",
		});

		expect(result).toEqual({ resumed: false });
		expect(runCalls).toEqual([]);
	});

	it("keeps the candidate when the agent config does not support resume", async () => {
		const db = createTestDb();
		seedResumableBinding(db, { resumeArgs: [] });
		const { deps, runCalls } = createDeps(db);

		const result = await resumeTerminalAgentSession(deps, {
			workspaceId: "ws-1",
			terminalId: "t1",
		});

		expect(result).toEqual({ resumed: false });
		expect(runCalls).toEqual([]);
		// The session id must survive: a config edit could re-enable resume.
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeDefined();
	});
});

const CODEX_CONFIG_ID = "00000000-0000-0000-0000-000000000002";

function seedAgentConfig(
	db: HostDb,
	{
		id = CLAUDE_CONFIG_ID,
		presetId = "claude",
		label = "Claude",
		command = "claude",
		resumeArgs = ["--resume"] as string[],
		displayOrder = 0,
	} = {},
) {
	db.insert(hostAgentConfigs)
		.values({
			id,
			presetId,
			label,
			command,
			promptTransport: "argv",
			resumeArgsJson: JSON.stringify(resumeArgs),
			displayOrder,
		})
		.run();
}

function seedLiveBinding(
	db: HostDb,
	{
		terminalId = "t1",
		agentId = "claude" as TerminalAgentId,
		agentSessionId = `sess-${terminalId}` as string | null,
		lastEventType = "Stop",
	} = {},
) {
	db.insert(terminalSessions)
		.values({
			id: terminalId,
			status: "active",
			originWorkspaceId: "ws-1",
			createdAt: 1,
		})
		.run();
	db.insert(terminalAgentBindings)
		.values({
			terminalId,
			workspaceId: "ws-1",
			agentId,
			agentSessionId,
			startedAt: 1,
			lastEventAt: 2,
			lastEventType,
		})
		.run();
}

function createStore(db: HostDb): TerminalAgentStore {
	return new TerminalAgentStore(new SqliteTerminalAgentBindingPersistence(db));
}

describe("listAccountRestartCandidates", () => {
	it("lists live provider sessions with a resumable conversation, nothing else", () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedAgentConfig(db, {
			id: CODEX_CONFIG_ID,
			presetId: "codex",
			label: "Codex",
			command: "codex",
			resumeArgs: ["resume"],
		});
		seedLiveBinding(db, { terminalId: "t-claude" });
		// Other provider — a claude switch must not touch it.
		seedLiveBinding(db, { terminalId: "t-codex", agentId: "codex" });
		// No conversation captured yet: nothing to resume into.
		seedLiveBinding(db, { terminalId: "t-no-session", agentSessionId: null });
		seedLiveBinding(db, {
			terminalId: "t-attached",
			lastEventType: "Attached",
		});

		const candidates = listAccountRestartCandidates(
			db,
			createStore(db),
			"claude",
		);

		expect(
			candidates.map(({ binding, agentLabel }) => ({
				terminalId: binding.terminalId,
				agentLabel,
			})),
		).toEqual([{ terminalId: "t-claude", agentLabel: "Claude" }]);
	});

	it("skips sessions whose config cannot resume", () => {
		const db = createTestDb();
		seedAgentConfig(db, { resumeArgs: [] });
		seedLiveBinding(db);

		expect(listAccountRestartCandidates(db, createStore(db), "claude")).toEqual(
			[],
		);
	});
});

describe("restartAccountSessions", () => {
	function createRestartDeps(
		db: HostDb,
		disposeSession?: RestartAccountSessionsDeps["disposeSession"],
	) {
		const disposedTerminals: string[] = [];
		const deps: RestartAccountSessionsDeps = {
			db,
			terminalAgentStore: createStore(db),
			disposeSession:
				disposeSession ??
				((terminalId) => {
					disposedTerminals.push(terminalId);
					return Promise.resolve();
				}),
		};
		return { deps, disposedTerminals };
	}

	it("kills each candidate crash-style, leaving a resume candidate behind", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedLiveBinding(db, { terminalId: "t1" });
		seedLiveBinding(db, { terminalId: "t2" });
		const { deps, disposedTerminals } = createRestartDeps(db);

		const result = await restartAccountSessions(deps, "claude");

		expect(result.restartedTerminalIds.sort()).toEqual(["t1", "t2"]);
		expect(disposedTerminals.sort()).toEqual(["t1", "t2"]);
		// "terminal-exited", not "disposed": auto-resume must pick these up.
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeDefined();
		expect(findResumeCandidateBinding(db, "ws-1", "t2")).toBeDefined();
		// The bindings left the live view, so a repeat restarts nothing.
		expect(await restartAccountSessions(deps, "claude")).toEqual({
			restartedTerminalIds: [],
		});
	});

	it("keeps the resume candidate when the dispose fails", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedLiveBinding(db, { terminalId: "t1" });
		const { deps } = createRestartDeps(db, () =>
			Promise.reject(new Error("daemon unreachable")),
		);

		const result = await restartAccountSessions(deps, "claude");

		expect(result).toEqual({ restartedTerminalIds: [] });
		// The reaper finishes the kill; the session id must stay resumable.
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeDefined();
	});
});
