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
import {
	findResumeCandidateBinding,
	listResumeCandidateBindings,
} from "../../../terminal-agents/persistence";
import type { AgentRunResult } from "../agents/agents";
import {
	explainTerminalAgentBinding,
	listAccountRestartCandidates,
	type RestartAccountSessionsDeps,
	type ResumeSessionDeps,
	restartAccountSessions,
	resumeAllTerminalAgentSessions,
	resumeTerminalAgentSession,
	waitForTerminalAgentStatus,
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
	{
		terminalId = "t1",
		resumeArgs = ["--resume"],
		lastEventType = "Stop" as "Stop" | "Attached",
	} = {},
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
			lastEventType,
			endedAt: 3,
			endReason: "terminal-exited",
		})
		.run();
}

/**
 * A second (or third) resumable terminal sharing an already-seeded agent
 * config — `seedResumableBinding` inserts its config row unconditionally, so
 * calling it twice for the same config id in one test violates the primary
 * key; this covers every additional terminal after the first.
 */
function seedResumableTerminal(db: HostDb, terminalId: string) {
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
	hasSession: ResumeSessionDeps["hasSession"] = () => null,
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
		hasSession,
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

	it("launches a never-prompted session fresh instead of resuming into nothing", async () => {
		const db = createTestDb();
		seedResumableBinding(db, { lastEventType: "Attached" });
		// Idle since SessionStart with no transcript on disk: a `--resume`
		// would exit with "no conversation found".
		const { deps, runCalls, disposedTerminals } = createDeps(
			db,
			undefined,
			() => false,
		);

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
			{ workspaceId: "ws-1", agent: CLAUDE_CONFIG_ID, prompt: "" },
		]);
		expect(disposedTerminals).toEqual(["t1"]);
	});

	it("resumes an idle session when the harness still holds its conversation", async () => {
		const db = createTestDb();
		// A session restored earlier and left idle is "Attached" too, but its
		// transcript exists — relaunching fresh would drop that conversation.
		seedResumableBinding(db, { lastEventType: "Attached" });
		const { deps, runCalls } = createDeps(db, undefined, (binding) =>
			binding.agentSessionId === "sess-t1" ? true : null,
		);

		await resumeTerminalAgentSession(deps, {
			workspaceId: "ws-1",
			terminalId: "t1",
		});

		expect(runCalls.map((call) => call.resumeSessionId)).toEqual(["sess-t1"]);
	});

	it("resumes an idle session when the harness store cannot be read", async () => {
		const db = createTestDb();
		// Unreadable or unsurveyed store: not evidence the conversation is
		// gone, so the saved session id is kept rather than discarded.
		seedResumableBinding(db, { lastEventType: "Attached" });
		const { deps, runCalls } = createDeps(db, undefined, () => null);

		await resumeTerminalAgentSession(deps, {
			workspaceId: "ws-1",
			terminalId: "t1",
		});

		expect(runCalls.map((call) => call.resumeSessionId)).toEqual(["sess-t1"]);
	});

	it("never consults the harness store for a session past its first prompt", async () => {
		const db = createTestDb();
		seedResumableBinding(db);
		const { deps, runCalls } = createDeps(db, undefined, () => false);

		await resumeTerminalAgentSession(deps, {
			workspaceId: "ws-1",
			terminalId: "t1",
		});

		expect(runCalls.map((call) => call.resumeSessionId)).toEqual(["sess-t1"]);
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

describe("resumeAllTerminalAgentSessions", () => {
	it("answers an empty sweep when the workspace has no dead-but-resumable sessions", async () => {
		const db = createTestDb();
		const { deps, runCalls } = createDeps(db);

		const { results } = await resumeAllTerminalAgentSessions(deps, {
			workspaceId: "ws-1",
		});

		expect(results).toEqual([]);
		expect(runCalls).toEqual([]);
	});

	it("resumes every candidate in the workspace", async () => {
		const db = createTestDb();
		seedResumableBinding(db, { terminalId: "t1" });
		seedResumableTerminal(db, "t2");
		const { deps, runCalls } = createDeps(db);

		const { results } = await resumeAllTerminalAgentSessions(deps, {
			workspaceId: "ws-1",
		});

		expect(results).toHaveLength(2);
		expect(results.every((r) => r.resumed)).toBe(true);
		expect(runCalls).toHaveLength(2);
		expect(runCalls.map((call) => call.resumeSessionId).sort()).toEqual([
			"sess-t1",
			"sess-t2",
		]);
		// Every candidate is consumed, same as the single-terminal path.
		expect(listResumeCandidateBindings(db, "ws-1")).toEqual([]);
	});

	it("does not let one candidate's launch failure stop the rest", async () => {
		const db = createTestDb();
		seedResumableBinding(db, { terminalId: "t-bad" });
		seedResumableTerminal(db, "t-good");
		const { deps, runCalls } = createDeps(db, (input) => {
			if (input.resumeSessionId === "sess-t-bad") {
				return Promise.reject(new Error("spawn failed"));
			}
			return Promise.resolve({
				kind: "terminal",
				sessionId: "t-new",
				label: "Claude",
			});
		});

		const { results } = await resumeAllTerminalAgentSessions(deps, {
			workspaceId: "ws-1",
		});

		expect(runCalls).toHaveLength(2);
		const bad = results.find((r) => r.terminalId === "t-bad");
		const good = results.find((r) => r.terminalId === "t-good");
		expect(bad).toEqual({
			terminalId: "t-bad",
			resumed: false,
			error: "spawn failed",
		});
		expect(good?.resumed).toBe(true);
		// The failed candidate must survive so a retry can pick it up.
		expect(findResumeCandidateBinding(db, "ws-1", "t-bad")).toBeDefined();
	});

	it("only sweeps the requested workspace", async () => {
		const db = createTestDb();
		seedResumableBinding(db, { terminalId: "t1" });
		db.insert(hostAgentConfigs)
			.values({
				id: "00000000-0000-0000-0000-0000000000ff",
				presetId: "claude",
				label: "Claude",
				command: "claude",
				promptTransport: "argv",
				resumeArgsJson: JSON.stringify(["--resume"]),
				displayOrder: 0,
			})
			.run();
		db.insert(terminalSessions)
			.values({
				id: "t-other-ws",
				status: "exited",
				originWorkspaceId: "ws-2",
				createdAt: 1,
			})
			.run();
		db.insert(terminalAgentBindings)
			.values({
				terminalId: "t-other-ws",
				workspaceId: "ws-2",
				agentId: "claude",
				agentSessionId: "sess-other-ws",
				startedAt: 1,
				lastEventAt: 2,
				lastEventType: "Stop",
				endedAt: 3,
				endReason: "terminal-exited",
			})
			.run();
		const { deps, runCalls } = createDeps(db);

		const { results } = await resumeAllTerminalAgentSessions(deps, {
			workspaceId: "ws-1",
		});

		expect(results).toHaveLength(1);
		expect(results[0]?.terminalId).toBe("t1");
		expect(runCalls).toHaveLength(1);
		// ws-2's candidate is untouched.
		expect(findResumeCandidateBinding(db, "ws-2", "t-other-ws")).toBeDefined();
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
		// No session id captured: no way to name what to relaunch.
		seedLiveBinding(db, { terminalId: "t-no-session", agentSessionId: null });
		// Idle since launch — still on the old account, still restarted.
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
			candidates
				.map(({ binding, agentLabel }) => ({
					terminalId: binding.terminalId,
					agentLabel,
				}))
				.sort((a, b) => a.terminalId.localeCompare(b.terminalId)),
		).toEqual([
			{ terminalId: "t-attached", agentLabel: "Claude" },
			{ terminalId: "t-claude", agentLabel: "Claude" },
		]);
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

describe("explainTerminalAgentBinding", () => {
	it("answers { binding: null } when no agent has ever reported", () => {
		const db = createTestDb();

		const result = explainTerminalAgentBinding(
			{ db, terminalAgentStore: createStore(db) },
			{ workspaceId: "ws-1", terminalId: "t-plain-shell" },
		);

		expect(result).toEqual({ binding: null });
	});

	it("surfaces the live binding's evidence with a host-clock sinceMs", () => {
		const db = createTestDb();
		seedTerminalSession(db, "t1");
		const store = createStore(db);
		store.recordEvent({
			terminalId: "t1",
			workspaceId: "ws-1",
			eventType: "Start",
			agentId: "claude",
			agentSessionId: "sess-t1",
			occurredAt: 1_000,
		});

		const result = explainTerminalAgentBinding(
			{ db, terminalAgentStore: store },
			{ workspaceId: "ws-1", terminalId: "t1" },
			5_000,
		);

		expect(result).toEqual({
			binding: {
				terminalId: "t1",
				workspaceId: "ws-1",
				agentId: "claude",
				agentSessionId: "sess-t1",
				definitionId: null,
				startedAt: 1_000,
				lastEventAt: 1_000,
				lastEventType: "Start",
				endedAt: null,
				endReason: null,
			},
			derivedStatus: "working",
			sinceMs: 4_000,
			msSincePtyOutput: null,
		});
	});

	it("computes msSincePtyOutput from an injected liveness source, against the same clock as sinceMs", () => {
		const db = createTestDb();
		seedTerminalSession(db, "t1");
		const store = createStore(db);
		store.recordEvent({
			terminalId: "t1",
			workspaceId: "ws-1",
			eventType: "Start",
			agentId: "claude",
			occurredAt: 1_000,
		});

		const result = explainTerminalAgentBinding(
			{
				db,
				terminalAgentStore: store,
				getPtyLastOutputAt: (terminalId, workspaceId) => {
					expect(terminalId).toBe("t1");
					expect(workspaceId).toBe("ws-1");
					return 3_000;
				},
			},
			{ workspaceId: "ws-1", terminalId: "t1" },
			5_000,
		);

		if (result.binding === null) throw new Error("expected a binding");
		expect(result.msSincePtyOutput).toBe(2_000);
	});

	it("answers null msSincePtyOutput when the liveness source has nothing for this terminal", () => {
		const db = createTestDb();
		seedTerminalSession(db, "t1");
		const store = createStore(db);
		store.recordEvent({
			terminalId: "t1",
			workspaceId: "ws-1",
			eventType: "Start",
			agentId: "claude",
			occurredAt: 1_000,
		});

		const result = explainTerminalAgentBinding(
			{
				db,
				terminalAgentStore: store,
				getPtyLastOutputAt: () => undefined,
			},
			{ workspaceId: "ws-1", terminalId: "t1" },
			5_000,
		);

		if (result.binding === null) throw new Error("expected a binding");
		expect(result.msSincePtyOutput).toBeNull();
	});

	it("derives each lifecycle event to the status the desktop would show", () => {
		const db = createTestDb();
		const store = createStore(db);
		const cases = [
			["PermissionRequest", "permission"],
			["Failed", "failed"],
			["Stop", "idle"],
			["Attached", "idle"],
		] as const;
		for (const [index, [eventType]] of cases.entries()) {
			seedTerminalSession(db, `t${index}`);
			store.recordEvent({
				terminalId: `t${index}`,
				workspaceId: "ws-1",
				eventType,
				agentId: "claude",
				occurredAt: 1_000,
			});
		}

		for (const [index, [, status]] of cases.entries()) {
			const result = explainTerminalAgentBinding(
				{ db, terminalAgentStore: store },
				{ workspaceId: "ws-1", terminalId: `t${index}` },
			);
			if (result.binding === null) throw new Error("expected a binding");
			expect(result.binding.agentSessionId).toBeNull();
			expect(result.derivedStatus).toBe(status);
		}
	});

	it("still explains an ended binding, including why it ended", () => {
		const db = createTestDb();
		seedTerminalSession(db, "t1");
		const store = createStore(db);
		store.recordEvent({
			terminalId: "t1",
			workspaceId: "ws-1",
			eventType: "Start",
			agentId: "claude",
			agentSessionId: "sess-t1",
			occurredAt: 1_000,
		});
		store.recordEvent({
			terminalId: "t1",
			workspaceId: "ws-1",
			eventType: "exit",
			occurredAt: 5_000,
		});
		// Ended rows leave the live view entirely.
		expect(store.get("t1")).toBeUndefined();

		const result = explainTerminalAgentBinding(
			{ db, terminalAgentStore: store },
			{ workspaceId: "ws-1", terminalId: "t1" },
			9_000,
		);

		expect(result).toEqual({
			binding: {
				terminalId: "t1",
				workspaceId: "ws-1",
				agentId: "claude",
				agentSessionId: "sess-t1",
				definitionId: null,
				startedAt: 1_000,
				lastEventAt: 1_000,
				lastEventType: "Start",
				endedAt: 5_000,
				endReason: "terminal-exited",
			},
			derivedStatus: "ended",
			sinceMs: 8_000,
			msSincePtyOutput: null,
		});
	});

	it("does not leak a binding from another workspace", () => {
		const db = createTestDb();
		seedTerminalSession(db, "t1");
		const store = createStore(db);
		store.recordEvent({
			terminalId: "t1",
			workspaceId: "ws-1",
			eventType: "Start",
			agentId: "claude",
			occurredAt: 1_000,
		});

		const result = explainTerminalAgentBinding(
			{ db, terminalAgentStore: store },
			{ workspaceId: "ws-other", terminalId: "t1" },
		);

		expect(result).toEqual({ binding: null });
	});
});

describe("waitForTerminalAgentStatus", () => {
	function startAgent(store: TerminalAgentStore, terminalId = "t1") {
		store.recordEvent({
			terminalId,
			workspaceId: "ws-1",
			eventType: "Start",
			agentId: "claude",
			agentSessionId: `sess-${terminalId}`,
			occurredAt: 1_000,
		});
	}

	it("rejects with NOT_FOUND instead of waiting when no agent has ever reported", async () => {
		const db = createTestDb();
		const store = createStore(db);

		await expect(
			waitForTerminalAgentStatus(
				{ db, terminalAgentStore: store },
				{
					workspaceId: "ws-1",
					terminalId: "t-plain-shell",
					until: ["idle"],
					timeoutMs: 10_000,
				},
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(store.listenerCount("change")).toBe(0);
	});

	it("resolves at once when the status already matches", async () => {
		const db = createTestDb();
		seedTerminalSession(db, "t1");
		const store = createStore(db);
		store.recordEvent({
			terminalId: "t1",
			workspaceId: "ws-1",
			eventType: "Stop",
			agentId: "claude",
			occurredAt: 1_000,
		});

		const startedAt = performance.now();
		const result = await waitForTerminalAgentStatus(
			{ db, terminalAgentStore: store },
			{
				workspaceId: "ws-1",
				terminalId: "t1",
				until: ["idle", "ended"],
				timeoutMs: 10_000,
			},
		);

		expect(performance.now() - startedAt).toBeLessThan(50);
		expect(result.derivedStatus).toBe("idle");
		expect(result.binding.terminalId).toBe("t1");
		expect(store.listenerCount("change")).toBe(0);
	});

	it("threads the getPtyLastOutputAt dep through to the resolved explanation", async () => {
		const db = createTestDb();
		seedTerminalSession(db, "t1");
		const store = createStore(db);
		store.recordEvent({
			terminalId: "t1",
			workspaceId: "ws-1",
			eventType: "Stop",
			agentId: "claude",
			occurredAt: 1_000,
		});

		const result = await waitForTerminalAgentStatus(
			{
				db,
				terminalAgentStore: store,
				getPtyLastOutputAt: () => 1_500,
			},
			{
				workspaceId: "ws-1",
				terminalId: "t1",
				until: ["idle"],
				timeoutMs: 10_000,
			},
		);

		expect(result.msSincePtyOutput).not.toBeNull();
	});

	it("resolves once a later hook event moves the status into the target set", async () => {
		const db = createTestDb();
		seedTerminalSession(db, "t1");
		const store = createStore(db);
		startAgent(store);

		const pending = waitForTerminalAgentStatus(
			{ db, terminalAgentStore: store },
			{
				workspaceId: "ws-1",
				terminalId: "t1",
				until: ["idle", "permission"],
				timeoutMs: 10_000,
			},
		);
		// A change that leaves the status outside the target set keeps waiting.
		store.recordEvent({
			terminalId: "t1",
			workspaceId: "ws-1",
			eventType: "Start",
			occurredAt: 1_500,
		});
		setTimeout(() => {
			store.recordEvent({
				terminalId: "t1",
				workspaceId: "ws-1",
				eventType: "PermissionRequest",
				occurredAt: 2_000,
			});
		}, 5);

		const result = await pending;

		expect(result.derivedStatus).toBe("permission");
		expect(result.binding.lastEventType).toBe("PermissionRequest");
		expect(result.binding.lastEventAt).toBe(2_000);
		expect(store.listenerCount("change")).toBe(0);
	});

	it("rejects with TIMEOUT once the deadline passes without a match", async () => {
		const db = createTestDb();
		seedTerminalSession(db, "t1");
		const store = createStore(db);
		startAgent(store);

		const startedAt = performance.now();
		await expect(
			waitForTerminalAgentStatus(
				{ db, terminalAgentStore: store },
				{
					workspaceId: "ws-1",
					terminalId: "t1",
					until: ["idle"],
					timeoutMs: 50,
				},
			),
		).rejects.toMatchObject({
			code: "TIMEOUT",
			message:
				"Timed out after 50ms waiting for terminal t1 to reach one of: idle",
		});
		const elapsed = performance.now() - startedAt;

		expect(elapsed).toBeGreaterThanOrEqual(40);
		expect(elapsed).toBeLessThan(1_000);
		expect(store.listenerCount("change")).toBe(0);
	});

	it("resolves a wait for ended once the terminal dies under the agent", async () => {
		const db = createTestDb();
		seedTerminalSession(db, "t1");
		const store = createStore(db);
		startAgent(store);

		const pending = waitForTerminalAgentStatus(
			{ db, terminalAgentStore: store },
			{
				workspaceId: "ws-1",
				terminalId: "t1",
				until: ["ended"],
				timeoutMs: 10_000,
			},
		);
		setTimeout(() => {
			store.recordEvent({
				terminalId: "t1",
				workspaceId: "ws-1",
				eventType: "exit",
				occurredAt: 5_000,
			});
		}, 5);

		const result = await pending;

		// The live entry is gone; the answer came from the persisted ended row.
		expect(store.get("t1")).toBeUndefined();
		expect(result.derivedStatus).toBe("ended");
		expect(result.binding).toMatchObject({
			agentSessionId: "sess-t1",
			endedAt: 5_000,
			endReason: "terminal-exited",
		});
		expect(store.listenerCount("change")).toBe(0);
	});
});
