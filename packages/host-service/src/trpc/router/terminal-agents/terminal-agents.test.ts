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
	findResumedSuccessorTerminalId,
} from "../../../terminal-agents/persistence";
import type { AgentRunResult } from "../agents/agents";
import {
	findResumedSuccessor,
	listAccountRestartCandidates,
	listRestartCandidates,
	type ResumeSessionDeps,
	restartAccountSessions,
	restartAgentSessions,
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

type BroadcastMessage = Parameters<
	ResumeSessionDeps["eventBus"]["broadcastTerminalLifecycle"]
>[0];

interface DepsHarness {
	deps: ResumeSessionDeps;
	runCalls: Array<Parameters<ResumeSessionDeps["runAgent"]>[0]>;
	disposedTerminals: string[];
	broadcasts: BroadcastMessage[];
}

function createDeps(
	db: HostDb,
	{
		runAgent,
		hasSession = () => null,
		disposeSession,
	}: {
		runAgent?: ResumeSessionDeps["runAgent"];
		hasSession?: ResumeSessionDeps["hasSession"];
		disposeSession?: ResumeSessionDeps["disposeSession"];
	} = {},
): DepsHarness {
	const runCalls: DepsHarness["runCalls"] = [];
	const disposedTerminals: string[] = [];
	const broadcasts: BroadcastMessage[] = [];
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
			return (
				disposeSession?.(terminalId) ??
				Promise.resolve({ daemonCloseSucceeded: true })
			);
		},
		hasSession,
		eventBus: {
			broadcastTerminalLifecycle: (message) => {
				broadcasts.push(message);
			},
		},
	};
	return { deps, runCalls, disposedTerminals, broadcasts };
}

describe("resumeTerminalAgentSession", () => {
	it("claims, relaunches with the saved session id, and disposes the dead terminal", async () => {
		const db = createTestDb();
		seedResumableBinding(db);
		const { deps, runCalls, disposedTerminals, broadcasts } = createDeps(db);

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
		// Every pane on t1 — in any window — learns where the session went.
		expect(broadcasts).toEqual([
			{
				workspaceId: "ws-1",
				terminalId: "t1",
				eventType: "resumed",
				resumedTerminalId: "t-new",
				label: "Claude",
				occurredAt: expect.any(Number),
			},
		]);
	});

	it("launches a never-prompted session fresh instead of resuming into nothing", async () => {
		const db = createTestDb();
		seedResumableBinding(db, { lastEventType: "Attached" });
		// Idle since SessionStart with no transcript on disk: a `--resume`
		// would exit with "no conversation found".
		const { deps, runCalls, disposedTerminals } = createDeps(db, {
			hasSession: () => false,
		});

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
		const { deps, runCalls } = createDeps(db, {
			hasSession: (binding) =>
				binding.agentSessionId === "sess-t1" ? true : null,
		});

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
		const { deps, runCalls } = createDeps(db, { hasSession: () => null });

		await resumeTerminalAgentSession(deps, {
			workspaceId: "ws-1",
			terminalId: "t1",
		});

		expect(runCalls.map((call) => call.resumeSessionId)).toEqual(["sess-t1"]);
	});

	it("never consults the harness store for a session past its first prompt", async () => {
		const db = createTestDb();
		seedResumableBinding(db);
		const { deps, runCalls } = createDeps(db, { hasSession: () => false });

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
		const { deps, runCalls } = createDeps(db, {
			runAgent: async () => {
				await gate;
				return { kind: "terminal", sessionId: "t-new", label: "Claude" };
			},
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
		const { deps, runCalls, disposedTerminals } = createDeps(db, {
			runAgent: () => {
				if (failNext) {
					failNext = false;
					return Promise.reject(new Error("spawn failed"));
				}
				return Promise.resolve({
					kind: "terminal",
					sessionId: "t-new",
					label: "Claude",
				});
			},
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

describe("findResumedSuccessorTerminalId", () => {
	it("follows a chain of resumes to the newest terminal", () => {
		const db = createTestDb();
		seedAgentConfig(db);
		for (const [terminalId, resumedInto] of [
			["t1", "t2"],
			["t2", "t3"],
			["t3", null],
		] as const) {
			db.insert(terminalSessions)
				.values({
					id: terminalId,
					status: resumedInto ? "disposed" : "active",
					originWorkspaceId: "ws-1",
					createdAt: 1,
				})
				.run();
			db.insert(terminalAgentBindings)
				.values({
					terminalId,
					workspaceId: "ws-1",
					agentId: "claude",
					agentSessionId: "sess",
					startedAt: 1,
					lastEventAt: 2,
					lastEventType: "Stop",
					...(resumedInto
						? {
								endedAt: 3,
								endReason: "resumed",
								resumedIntoTerminalId: resumedInto,
							}
						: {}),
				})
				.run();
		}

		expect(findResumedSuccessorTerminalId(db, "ws-1", "t1")).toBe("t3");
		expect(findResumedSuccessorTerminalId(db, "ws-1", "t2")).toBe("t3");
		expect(findResumedSuccessorTerminalId(db, "ws-1", "t3")).toBeUndefined();
		// Another workspace's terminal id is not followed.
		expect(findResumedSuccessorTerminalId(db, "ws-2", "t1")).toBeUndefined();
	});
});

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
	it("kills each candidate and relaunches it here with its saved session id", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedLiveBinding(db, { terminalId: "t1" });
		seedLiveBinding(db, { terminalId: "t2" });
		let launches = 0;
		const order: string[] = [];
		const { deps, broadcasts } = createDeps(db, {
			runAgent: (input) => {
				order.push(`launch ${input.resumeSessionId}`);
				return Promise.resolve({
					kind: "terminal",
					sessionId: `t-new-${++launches}`,
					label: "Claude",
				} satisfies AgentRunResult);
			},
			disposeSession: (terminalId) => {
				order.push(`kill ${terminalId}`);
				return Promise.resolve({ daemonCloseSucceeded: true });
			},
		});

		const result = await restartAccountSessions(deps, "claude");

		expect(result.restartedTerminalIds.sort()).toEqual(["t1", "t2"]);
		// The old agent is killed before its session is resumed, so two
		// processes never share one conversation. The resume path's own
		// dispose of the already-dead terminal is a harmless repeat.
		expect(order).toEqual([
			"kill t1",
			"launch sess-t1",
			"kill t1",
			"kill t2",
			"launch sess-t2",
			"kill t2",
		]);
		// No pane had to be open: the relaunch happened here, and each old
		// terminal is announced as resumed for any pane that is.
		expect(
			broadcasts.map((message) =>
				message.eventType === "resumed"
					? [message.terminalId, message.resumedTerminalId]
					: message.eventType,
			),
		).toEqual([
			["t1", "t-new-1"],
			["t2", "t-new-2"],
		]);
		// Consumed, not left for a renderer that may never come.
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
		expect(findResumeCandidateBinding(db, "ws-1", "t2")).toBeUndefined();
		// The bindings left the live view, so a repeat restarts nothing.
		expect(await restartAccountSessions(deps, "claude")).toEqual({
			restartedTerminalIds: [],
		});
	});

	it("lets a pane that missed the event find the relaunched terminal, even for a never-prompted session launched fresh", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedLiveBinding(db, { terminalId: "t1", lastEventType: "Attached" });
		// No transcript: the relaunch is fresh, so the new terminal will get
		// a new session id — the link must not depend on sharing the old one.
		const { deps, runCalls } = createDeps(db, { hasSession: () => false });
		expect(findResumedSuccessor(db, "ws-1", "t1")).toBeNull();

		await restartAccountSessions(deps, "claude");

		expect(runCalls[0]?.resumeSessionId).toBeUndefined();
		expect(findResumedSuccessor(db, "ws-1", "t1")).toEqual({
			terminalId: "t-new",
			label: "Claude",
		});
		expect(findResumedSuccessor(db, "ws-1", "t-new")).toBeNull();
	});

	it("leaves a candidate running, and resumable, when its kill fails", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedLiveBinding(db, { terminalId: "t1" });
		const { deps, runCalls } = createDeps(db, {
			disposeSession: () => Promise.reject(new Error("daemon unreachable")),
		});

		const result = await restartAccountSessions(deps, "claude");

		expect(result).toEqual({ restartedTerminalIds: [] });
		// Never relaunch beside a process that may still be alive.
		expect(runCalls).toEqual([]);
		// The reaper finishes the kill; the session id must stay resumable.
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeDefined();
	});

	it("does not relaunch when disposal resolves with a failed daemon close", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedLiveBinding(db);
		const { deps, runCalls } = createDeps(db, {
			disposeSession: async () => ({ daemonCloseSucceeded: false }),
		});
		expect(await restartAccountSessions(deps, "claude")).toEqual({
			restartedTerminalIds: [],
		});
		expect(runCalls).toHaveLength(0);
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeDefined();
	});

	it("does not report a restart when an explicit kill consumed the candidate", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedLiveBinding(db);
		const { deps, runCalls } = createDeps(db, {
			disposeSession: async () => {
				createStore(db).markTerminalDisposed("t1");
				return { daemonCloseSucceeded: true };
			},
		});
		expect(await restartAccountSessions(deps, "claude")).toEqual({
			restartedTerminalIds: [],
		});
		expect(runCalls).toHaveLength(0);
	});

	it("keeps the candidate for a pane to retry when the relaunch throws", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedLiveBinding(db, { terminalId: "t1" });
		const { deps, disposedTerminals, broadcasts } = createDeps(db, {
			runAgent: () => Promise.reject(new Error("spawn failed")),
		});

		const result = await restartAccountSessions(deps, "claude");

		expect(result).toEqual({ restartedTerminalIds: [] });
		expect(disposedTerminals).toEqual(["t1"]);
		expect(broadcasts).toEqual([]);
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeDefined();
	});
});

describe("restartAgentSessions", () => {
	it("restarts non-Claude/Codex agents with their saved conversation ids", async () => {
		const db = createTestDb();
		seedAgentConfig(db, {
			id: "gemini-config",
			presetId: "gemini",
			label: "Gemini",
			command: "gemini",
		});
		seedLiveBinding(db, { terminalId: "gemini", agentId: "gemini" });
		const { deps, runCalls } = createDeps(db);
		expect(
			listRestartCandidates(db, deps.terminalAgentStore).map(
				(row) => row.agentLabel,
			),
		).toEqual(["Gemini"]);
		expect(await restartAgentSessions(deps, ["gemini"])).toEqual({
			restartedTerminalIds: ["gemini"],
			failedTerminalIds: [],
		});
		expect(runCalls[0]).toMatchObject({
			agent: "gemini-config",
			resumeSessionId: "sess-gemini",
		});
	});

	it("uses the custom definition's resume capability instead of its preset", async () => {
		const db = createTestDb();
		seedAgentConfig(db, { resumeArgs: [] });
		seedAgentConfig(db, {
			id: "custom:reviewer",
			label: "Reviewer",
			resumeArgs: ["--continue-session"],
		});
		seedLiveBinding(db, { terminalId: "custom" });
		db.update(terminalAgentBindings)
			.set({ definitionId: "custom:reviewer" })
			.run();
		const { deps, runCalls } = createDeps(db);
		expect(
			listRestartCandidates(db, deps.terminalAgentStore).map(
				(row) => row.agentLabel,
			),
		).toEqual(["Reviewer"]);
		await restartAgentSessions(deps, ["custom"]);
		expect(runCalls[0]).toMatchObject({
			agent: "custom:reviewer",
			resumeSessionId: "sess-custom",
		});
	});

	it("does not kill agents without a session id, resume command, or configuration", async () => {
		const db = createTestDb();
		seedAgentConfig(db, { resumeArgs: [] });
		seedAgentConfig(db, {
			id: CODEX_CONFIG_ID,
			presetId: "codex",
			resumeArgs: ["resume"],
		});
		seedLiveBinding(db, { terminalId: "unsupported" });
		seedLiveBinding(db, { terminalId: "unknown", agentId: "gemini" });
		seedLiveBinding(db, {
			terminalId: "no-id",
			agentId: "codex",
			agentSessionId: null,
		});
		const { deps, disposedTerminals } = createDeps(db);
		expect(listRestartCandidates(db, deps.terminalAgentStore)).toEqual([]);
		expect(
			await restartAgentSessions(deps, ["unsupported", "unknown", "no-id"]),
		).toEqual({ restartedTerminalIds: [], failedTerminalIds: [] });
		expect(disposedTerminals).toEqual([]);
	});

	it("restarts only confirmed sessions that are still live, once each", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		seedLiveBinding(db, { terminalId: "confirmed" });
		seedLiveBinding(db, { terminalId: "new-session" });
		seedLiveBinding(db, { terminalId: "closed" });
		const { deps, runCalls } = createDeps(db);
		deps.terminalAgentStore.markTerminalDisposed("closed");
		expect(
			await restartAgentSessions(deps, [
				"confirmed",
				"confirmed",
				"closed",
				"missing",
			]),
		).toEqual({ restartedTerminalIds: ["confirmed"], failedTerminalIds: [] });
		expect(runCalls).toHaveLength(1);
		expect(deps.terminalAgentStore.list().map((row) => row.terminalId)).toEqual(
			["new-session"],
		);
	});

	it("reports failed closes and launches while continuing with other sessions", async () => {
		const db = createTestDb();
		seedAgentConfig(db);
		for (const terminalId of ["kill-fails", "launch-fails", "ok"])
			seedLiveBinding(db, { terminalId });
		const { deps, runCalls } = createDeps(db, {
			disposeSession: async (id) => ({
				daemonCloseSucceeded: id !== "kill-fails",
			}),
			runAgent: async (input) => {
				if (input.resumeSessionId === "sess-launch-fails")
					throw new Error("spawn failed");
				return { kind: "terminal", sessionId: "new-ok", label: "Claude" };
			},
		});
		expect(
			await restartAgentSessions(deps, ["kill-fails", "launch-fails", "ok"]),
		).toEqual({
			restartedTerminalIds: ["ok"],
			failedTerminalIds: ["kill-fails", "launch-fails"],
		});
		expect(runCalls.map((call) => call.resumeSessionId)).toEqual([
			"sess-launch-fails",
			"sess-ok",
		]);
		expect(
			findResumeCandidateBinding(db, "ws-1", "launch-fails"),
		).toBeDefined();
	});
});
