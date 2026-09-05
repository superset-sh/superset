import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
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
	type TerminalAgentId,
	TerminalAgentStore,
} from "../../../terminal-agents";
import { findResumeCandidateBinding } from "../../../terminal-agents/persistence";
import type { AgentRunResult } from "../agents/agents";
import {
	killAndResumeTerminalAgent,
	listAccountRestartCandidates,
	type RestartAccountSessionsDeps,
	type ResumeSessionDeps,
	registerPendingNudge,
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
	{
		terminalId = "t1",
		resumeArgs = ["--resume"],
		lastEventType = "Stop" as "Stop" | "Attached",
		agentSessionId,
	}: {
		terminalId?: string;
		resumeArgs?: string[];
		lastEventType?: "Stop" | "Attached";
		agentSessionId?: string;
	} = {},
) {
	const sessionId = agentSessionId ?? `sess-${terminalId}`;
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
		.onConflictDoNothing()
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
			agentSessionId: sessionId,
			startedAt: 1,
			lastEventAt: 2,
			lastEventType,
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

const CODEX_CONFIG_ID = "00000000-0000-0000-0000-000000000002";

/** A session pinned to a hand-exported `CLAUDE_CONFIG_DIR`: no Superset twin
 * beside it, so `resolveAgentAccountDir` reports `managed: false` and the
 * engine cannot move it. */
const UNMANAGED_ENV = { CLAUDE_CONFIG_DIR: "/hand/exported/claude" };
const UNMANAGED_DEFINITION_ID = "custom:claude-exported" as AgentDefinitionId;

function seedAgentConfig(
	db: HostDb,
	{
		id = CLAUDE_CONFIG_ID,
		presetId = "claude",
		label = "Claude",
		command = "claude",
		resumeArgs = ["--resume"] as string[],
		displayOrder = 0,
		env = {} as Record<string, string>,
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
			envJson: JSON.stringify(env),
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
		definitionId = undefined as AgentDefinitionId | undefined,
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
			definitionId,
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
		seedAgentConfig(db, { env: UNMANAGED_ENV });
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

	// #28: the dialog counts only the sessions the engine cannot move, so the
	// mutation must kill only those — a managed Claude session picked the
	// swapped login up in place and restarting it would drop a live turn.
	it("restarts only the sessions the engine could not move", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedAgentConfig(db, {
			id: UNMANAGED_DEFINITION_ID,
			label: "Claude (exported)",
			env: UNMANAGED_ENV,
			displayOrder: 1,
		});
		seedLiveBinding(db, { terminalId: "t-managed" });
		seedLiveBinding(db, {
			terminalId: "t-unmanaged",
			definitionId: UNMANAGED_DEFINITION_ID,
		});
		const { deps, disposedTerminals } = createRestartDeps(db);

		const result = await restartAccountSessions(deps, "claude");

		expect(result.restartedTerminalIds).toEqual(["t-unmanaged"]);
		expect(disposedTerminals).toEqual(["t-unmanaged"]);
		// The managed session was never marked ended, so nothing resumes it.
		expect(findResumeCandidateBinding(db, "ws-1", "t-managed")).toBeUndefined();
		expect(findResumeCandidateBinding(db, "ws-1", "t-unmanaged")).toBeDefined();
	});

	it("keeps the resume candidate when the dispose fails", async () => {
		const db = createTestDb();
		seedAgentConfig(db, { env: UNMANAGED_ENV });
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

describe("pending nudge (KTD8)", () => {
	it("launches with a registered nudge whichever caller wins the race", async () => {
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

		registerPendingNudge("ws-1", "t1", "Continue where you left off.");

		const input = { workspaceId: "ws-1", terminalId: "t1" };
		// The renderer's empty-prompt resume races the mover's; one launch wins.
		const a = resumeTerminalAgentSession(deps, input);
		const b = resumeTerminalAgentSession(deps, input);
		releaseLaunch();
		await Promise.all([a, b]);

		expect(runCalls).toEqual([
			{
				workspaceId: "ws-1",
				agent: CLAUDE_CONFIG_ID,
				prompt: "Continue where you left off.",
				resumeSessionId: "sess-t1",
			},
		]);
	});

	it("consumes the nudge exactly once", async () => {
		const db = createTestDb();
		seedResumableBinding(db, { terminalId: "t1" });
		const { deps, runCalls } = createDeps(db);
		registerPendingNudge("ws-1", "t1", "nudge");

		await resumeTerminalAgentSession(deps, {
			workspaceId: "ws-1",
			terminalId: "t1",
		});
		// A second restart of the same terminal must not re-send the nudge.
		seedResumableBinding(db, { terminalId: "t2" });
		registerPendingNudge("ws-1", "t2", "");
		await resumeTerminalAgentSession(deps, {
			workspaceId: "ws-1",
			terminalId: "t2",
		});

		expect(runCalls.map((call) => call.prompt)).toEqual(["nudge", ""]);
	});

	it("keeps the nudge pending when the launch fails", async () => {
		const db = createTestDb();
		seedResumableBinding(db);
		let failNext = true;
		const { deps, runCalls } = createDeps(db, () => {
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
		registerPendingNudge("ws-1", "t1", "nudge");

		const input = { workspaceId: "ws-1", terminalId: "t1" };
		await expect(resumeTerminalAgentSession(deps, input)).rejects.toThrow(
			"spawn failed",
		);
		await resumeTerminalAgentSession(deps, input);

		expect(runCalls.map((call) => call.prompt)).toEqual(["nudge", "nudge"]);
	});

	// A terminal id is a fresh UUID, so a nudge left behind on an exit that
	// cannot consume it is unreachable for the life of the process.
	it("drops the nudge on every exit that cannot consume it", async () => {
		const input = { workspaceId: "ws-1", terminalId: "t1" };

		// Nothing to claim: the candidate lost the race, or never existed.
		const noCandidate = createTestDb();
		const first = createDeps(noCandidate);
		registerPendingNudge("ws-1", "t1", "nudge");
		expect(await resumeTerminalAgentSession(first.deps, input)).toEqual({
			resumed: false,
		});
		seedResumableBinding(noCandidate, { terminalId: "t1" });
		await resumeTerminalAgentSession(first.deps, input);
		expect(first.runCalls.map((call) => call.prompt)).toEqual([""]);

		// Resume unsupported by the agent config.
		const noResume = createTestDb();
		seedResumableBinding(noResume, { terminalId: "t1", resumeArgs: [] });
		const second = createDeps(noResume);
		registerPendingNudge("ws-1", "t1", "nudge");
		expect(await resumeTerminalAgentSession(second.deps, input)).toEqual({
			resumed: false,
		});
		noResume
			.update(hostAgentConfigs)
			.set({ resumeArgsJson: JSON.stringify(["--resume"]) })
			.where(eq(hostAgentConfigs.id, CLAUDE_CONFIG_ID))
			.run();
		await resumeTerminalAgentSession(second.deps, input);
		expect(second.runCalls.map((call) => call.prompt)).toEqual([""]);

		// A stored session id that could never become a `--resume` argument.
		const malformed = createTestDb();
		seedResumableBinding(malformed, {
			terminalId: "t1",
			agentSessionId: 'x"; rm -rf ~; #',
		});
		const third = createDeps(malformed);
		registerPendingNudge("ws-1", "t1", "nudge");
		expect(await resumeTerminalAgentSession(third.deps, input)).toEqual({
			resumed: false,
		});
		malformed
			.update(terminalAgentBindings)
			.set({ agentSessionId: "sess-t1" })
			.where(eq(terminalAgentBindings.terminalId, "t1"))
			.run();
		await resumeTerminalAgentSession(third.deps, input);
		expect(third.runCalls.map((call) => call.prompt)).toEqual([""]);
	});

	it("refuses a session id that is not a plain session token", async () => {
		const db = createTestDb();
		seedResumableBinding(db, { agentSessionId: 'x"; rm -rf ~; #' });
		const { deps, runCalls } = createDeps(db);

		const result = await resumeTerminalAgentSession(deps, {
			workspaceId: "ws-1",
			terminalId: "t1",
		});

		expect(result).toEqual({ resumed: false });
		expect(runCalls).toEqual([]);
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeDefined();
	});
});

describe("killAndResumeTerminalAgent", () => {
	it("kills crash-style and relaunches with the nudge as the prompt", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedLiveBinding(db, { terminalId: "t1" });
		const { deps, runCalls, disposedTerminals } = createDeps(db);

		const result = await killAndResumeTerminalAgent(deps, {
			workspaceId: "ws-1",
			terminalId: "t1",
			prompt: "nudge",
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
				prompt: "nudge",
				resumeSessionId: "sess-t1",
			},
		]);
		// Killed before the relaunch, then swept again by the resume path's
		// own cleanup — the second dispose lands on an already-dead terminal.
		expect(disposedTerminals).toEqual(["t1", "t1"]);
	});

	it("restarts without a prompt when no nudge is given", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedLiveBinding(db, { terminalId: "t1" });
		const { deps, runCalls } = createDeps(db);

		await killAndResumeTerminalAgent(deps, {
			workspaceId: "ws-1",
			terminalId: "t1",
		});

		expect(runCalls.map((call) => call.prompt)).toEqual([""]);
	});
});
