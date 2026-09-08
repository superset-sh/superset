/**
 * KTD5 on the loser's side: what a lock loser reconciles the first time it
 * sees the owner's runtime. A Claude row's account is the login inside the
 * shared active dir, but the row's own `configDir` is resolved from the host
 * pointer — and the pointer only names the active dir once a Claude switch has
 * happened. Until then every unpinned row compares unequal to the active dir,
 * and restarting them lands them back on the login they were already on.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../db/index.ts";
import { AccountEngine } from "./account-engine.ts";
import type { ClaudeSwapResult } from "./claude-login-swap.ts";
import { EngineState } from "./engine-state.ts";
import type { AccountEngineHostDeps } from "./host-deps.ts";
import type { MovableSession } from "./session-mover.ts";

const T0 = 1_800_000_000_000;
const ACTIVE_DIR = "/superset-home/accounts/claude-active";
/** The machine's own Codex home, which `selection: null` names. */
const AMBIENT_CODEX_HOME = "/home/tester/.codex";
/** Nothing in these tests swaps a login: a loser never touches credentials. */
const NO_SWAP: ClaudeSwapResult = {
	ok: false,
	code: "owner-unknown",
	reason: "no login to swap in this test",
};

function session(over: Partial<MovableSession>): MovableSession {
	return {
		workspaceId: "ws-1",
		terminalId: "term-1",
		agent: "claude",
		managed: true,
		configDir: "/profiles/a",
		lastEventType: "Stop",
		lastEventAt: T0 - 1000,
		...over,
	};
}

interface Harness {
	engine: AccountEngine;
	moved: MovableSession[][];
}

/**
 * A lock loser on its first tick: another instance already holds the lock, and
 * the owner's runtime already names the account it chose.
 */
function loser(input: {
	sessions: MovableSession[];
	pointer: { claudeConfigDir: string | null; codexHome: string | null };
	active: { accountId: string | null; selection: string | null };
	agent?: "claude" | "codex";
	/** The pty daemon down for one tick, and healthy after it. */
	throwOnFirstList?: boolean;
}): Harness {
	const state = new EngineState();
	// The owner. Claimed here so this engine's own claim loses.
	expect(new EngineState().claimLock("owner-nonce", T0)).toBe(true);
	const runtime = state.readRuntime();
	const agent = input.agent ?? "claude";
	runtime.perAgent[agent].activeAccountId = input.active.accountId;
	runtime.perAgent[agent].activeSelection = input.active.selection;
	state.writeRuntime(runtime);

	const moved: MovableSession[][] = [];
	let lists = 0;
	const engine = new AccountEngine({
		engineState: state,
		db: {} as HostDb,
		hostDeps: {
			listSessions: (forAgent) => {
				lists += 1;
				if (input.throwOnFirstList && lists === 1) {
					throw new Error("the pty daemon is not answering");
				}
				return input.sessions.filter((row) => row.agent === forAgent);
			},
			isAgentBusy: () => false,
			isTerminalAlive: () => true,
			killAndResume: async () => null,
			sendToTerminal: async () => {},
			snapshotTerminal: async () => null,
			hasStartedAgent: () => true,
			isBracketedPasteActive: () => true,
		} satisfies AccountEngineHostDeps,
		quotaStore: {
			entries: () => [],
			entry: () => undefined,
			read: async () => [],
			refreshDue: async () => {},
			setSnapshotSink: () => {},
			setSnapshotSource: () => {},
			snapshot: () => ({ entries: [] }),
		},
		mover: {
			moveAtIdle: async (_agent, rows) => {
				moved.push(rows ?? []);
				return { movedTerminalIds: [], deferredTerminalIds: [] };
			},
			fallbackRestart: async () => true,
			corroborateLimitStop: async () => true,
			onExternalSwitch: async () => {
				moved.push(input.sessions);
				return { movedTerminalIds: [], deferredTerminalIds: [] };
			},
		},
		broadcast: { switched: () => {}, engineState: () => {} },
		now: () => T0,
		setIntervalFn: (() =>
			({ unref() {} }) as unknown as ReturnType<
				typeof setInterval
			>) as unknown as typeof setInterval,
		clearIntervalFn: (() => {}) as unknown as typeof clearInterval,
		platform: "linux",
		swap: async () => NO_SWAP,
		seed: async () => NO_SWAP,
		ensureActiveDir: async () => ACTIVE_DIR,
		setPointer: () => {},
		readPointerSelections: () => input.pointer,
		updateClaudeStateFile: async () => {},
		setBindingRecorder: () => {},
		resolveActiveDir: () => ACTIVE_DIR,
		readActiveIdentity: async () => ({
			accountUuid: null,
			credentialHash: null,
		}),
		readCodexIdentity: async () => null,
	});
	return { engine, moved };
}

describe("a lock loser's first reconcile", () => {
	let home: string;
	let previousHome: string | undefined;
	let previousCodexHome: string | undefined;
	let previousInjectedCodexHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		previousCodexHome = process.env.CODEX_HOME;
		previousInjectedCodexHome = process.env.SUPERSET_DEFAULT_CODEX_HOME;
		home = mkdtempSync(join(tmpdir(), "superset-account-engine-follow-"));
		process.env.SUPERSET_HOME_DIR = home;
		// The ambient home, so the default-home case does not depend on the
		// machine running the test. Not Superset's own injection, hence the
		// twin variable being cleared.
		process.env.CODEX_HOME = AMBIENT_CODEX_HOME;
		delete process.env.SUPERSET_DEFAULT_CODEX_HOME;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
		else process.env.CODEX_HOME = previousCodexHome;
		if (previousInjectedCodexHome === undefined)
			delete process.env.SUPERSET_DEFAULT_CODEX_HOME;
		else process.env.SUPERSET_DEFAULT_CODEX_HOME = previousInjectedCodexHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("leaves Claude sessions alone while the pointer still names a profile dir", async () => {
		// No Claude switch has happened on the owner yet, so every managed row
		// launched from the pointer's profile. Killing and resuming them would
		// bring them back on the very login they are already running.
		const { engine, moved } = loser({
			sessions: [
				session({ terminalId: "term-1" }),
				session({ terminalId: "term-2" }),
			],
			pointer: { claudeConfigDir: "/profiles/a", codexHome: null },
			active: { accountId: "acct-b", selection: "/profiles/b" },
		});

		await engine.tick();

		expect(moved).toEqual([]);
	});

	it("moves Claude sessions off a stale dir once the pointer names the active dir", async () => {
		const { engine, moved } = loser({
			sessions: [session({ terminalId: "term-1" })],
			pointer: { claudeConfigDir: ACTIVE_DIR, codexHome: null },
			active: { accountId: "acct-b", selection: "/profiles/b" },
		});

		await engine.tick();

		expect(moved.flat().map((row) => row.terminalId)).toEqual(["term-1"]);
	});

	it("leaves Codex sessions alone when the owner's account is the default home", async () => {
		// `selection: null` is how the default Codex home is recorded, not an
		// absence: the owner named a real ChatGPT account. Every managed row
		// carries the resolved home as its `configDir` — never null, because
		// the launch injects CODEX_HOME — so comparing against the raw null
		// would read every pane as stale and restart it onto the home it is
		// already on.
		const { engine, moved } = loser({
			sessions: [
				session({
					agent: "codex",
					terminalId: "term-3",
					configDir: AMBIENT_CODEX_HOME,
				}),
			],
			pointer: { claudeConfigDir: "/profiles/a", codexHome: null },
			active: { accountId: "acct-chatgpt", selection: null },
			agent: "codex",
		});

		await engine.tick();

		expect(moved).toEqual([]);
	});

	it("still moves a Codex session off the wrong home", async () => {
		// Codex's account *is* its config dir, and the row resolves from the
		// same value the runtime names — the Claude pointer says nothing here.
		const { engine, moved } = loser({
			sessions: [
				session({
					agent: "codex",
					terminalId: "term-3",
					configDir: "/codex/a",
				}),
			],
			pointer: { claudeConfigDir: "/profiles/a", codexHome: "/codex/a" },
			active: { accountId: "acct-b", selection: "/codex/b" },
			agent: "codex",
		});

		await engine.tick();

		expect(moved.flat().map((row) => row.terminalId)).toEqual(["term-3"]);
	});

	it("retries the follow on the next tick when the first one throws", async () => {
		// Marking the agent followed before the move ran means one failed
		// listing costs the follow for the life of the process: every later
		// tick reads the same value back and skips it, and the loser's
		// sessions stay on the account the owner switched off.
		const { engine, moved } = loser({
			sessions: [
				session({
					agent: "codex",
					terminalId: "term-3",
					configDir: "/codex/a",
				}),
			],
			pointer: { claudeConfigDir: "/profiles/a", codexHome: "/codex/a" },
			active: { accountId: "acct-b", selection: "/codex/b" },
			agent: "codex",
			throwOnFirstList: true,
		});

		await engine.tick();

		expect(moved).toEqual([]);

		await engine.tick();

		expect(moved.flat().map((row) => row.terminalId)).toEqual(["term-3"]);
	});

	it("moves nothing when the tick is released after stop()", async () => {
		// The same Codex row as above, so the only difference is the shutdown.
		// A stopped engine answers false to `ensureOwnership`, which this path
		// reads as "another instance owns the lock" — so a tick still queued on
		// the mutation lane when the quit lands would end the shutdown by
		// restarting every managed terminal into a service on its way out.
		const { engine, moved } = loser({
			sessions: [
				session({
					agent: "codex",
					terminalId: "term-3",
					configDir: "/codex/a",
				}),
			],
			pointer: { claudeConfigDir: "/profiles/a", codexHome: "/codex/a" },
			active: { accountId: "acct-b", selection: "/codex/b" },
			agent: "codex",
		});

		let release = () => {};
		const held = new Promise<void>((done) => {
			release = done;
		});
		// A user action holding the lane, the interval fires behind it, the
		// quit lands, and only then does the lane let go.
		const lane = engine.runExclusive(() => held);
		const queued = engine.tick();
		const stopping = engine.stop();
		release();
		await Promise.all([lane, queued, stopping]);

		expect(moved).toEqual([]);
	});
});
