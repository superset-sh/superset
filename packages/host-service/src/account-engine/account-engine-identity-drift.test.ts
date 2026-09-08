/**
 * KTD3: what the tick does when the active Claude dir's identity block names
 * an account this host did not record as active.
 *
 * The answer turns on `lastWritten` — what *this process* put in the dir — and
 * that is in-memory only, so a host-service restart clears it. Adopting on an
 * empty `lastWritten` names whoever `.claude.json` says while the dir may hold
 * the credential of the account the runtime recorded, and the next swap then
 * saves that credential into the adopted account's store: one account's token
 * written over another's login. Park instead, and keep re-asserting and
 * adopting exactly as before once this process has written the dir.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../db/index.ts";
import type {
	AccountEngineStatePayload,
	AccountSwitchedPayload,
} from "../events/types.ts";
import type { UsageAccount } from "../trpc/router/usage/types.ts";
import { AccountEngine, type ActiveDirIdentity } from "./account-engine.ts";
import { EngineState } from "./engine-state.ts";
import type { AccountEngineHostDeps } from "./host-deps.ts";
import type { QuotaEntry } from "./quota-store.ts";

const T0 = 1_800_000_000_000;
const ACTIVE_DIR = "/superset-home/accounts/claude-active";

function usageAccount(over: Partial<UsageAccount>): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey: "key-a",
		accountId: "acct-a",
		sourceLabel: "~/.claude",
		email: "a@example.com",
		plan: "max",
		status: "ok",
		statusDetail: null,
		windows: [
			{
				id: "five_hour",
				label: "Session (5h)",
				usedPercent: 10,
				resetsAt: null,
			},
		],
		creditsBalance: null,
		extraUsage: null,
		selection: "/profiles/a",
		isDefault: false,
		inRotation: true,
		managed: true,
		fetchedAt: new Date(T0),
		...over,
	};
}

function entryFor(account: UsageAccount): QuotaEntry {
	return {
		key: `${account.agent}:${account.selection ?? "default"}`,
		agent: account.agent,
		selection: account.selection,
		accounts: [account],
		fetchedAt: T0,
		nextPollAt: T0,
		backoffMs: 0,
		lastError: null,
		tokenState: account.status,
		fetchable: true,
		inflight: null,
	};
}

/** Three logins, all well under the threshold: nothing here is due a switch. */
function claudeAccounts(): QuotaEntry[] {
	return [
		entryFor(usageAccount({})),
		entryFor(
			usageAccount({
				accountKey: "key-b",
				accountId: "acct-b",
				selection: "/profiles/b",
				email: "b@example.com",
			}),
		),
		entryFor(
			usageAccount({
				accountKey: "key-c",
				accountId: "acct-c",
				selection: "/profiles/c",
				email: "c@example.com",
			}),
		),
	];
}

interface Harness {
	engine: AccountEngine;
	state: EngineState;
	switched: AccountSwitchedPayload[];
	states: AccountEngineStatePayload[];
	/** What the next `readActiveIdentity` returns; the tests move it. */
	dir: { current: ActiveDirIdentity };
	/** The identity blocks the re-assert path wrote back. */
	reasserted: Record<string, unknown>[];
}

function harness(): Harness {
	const state = new EngineState();
	const runtime = state.readRuntime();
	// What this host believes is active as the tick starts.
	runtime.perAgent.claude.activeAccountId = "acct-a";
	runtime.perAgent.claude.activeSelection = "/profiles/a";
	state.writeRuntime(runtime);

	const switched: AccountSwitchedPayload[] = [];
	const states: AccountEngineStatePayload[] = [];
	const reasserted: Record<string, unknown>[] = [];
	// The dir holds acct-a's login, exactly as recorded, until a test moves it.
	const dir: { current: ActiveDirIdentity } = {
		current: { accountUuid: "acct-a", credentialHash: "hash-a" },
	};

	const engine = new AccountEngine({
		engineState: state,
		db: {} as HostDb,
		hostDeps: {
			listSessions: () => [],
			isAgentBusy: () => false,
			isTerminalAlive: () => true,
			killAndResume: async () => null,
			sendToTerminal: async () => {},
			snapshotTerminal: async () => null,
			hasStartedAgent: () => true,
			isBracketedPasteActive: () => true,
		} satisfies AccountEngineHostDeps,
		quotaStore: {
			entries: () => claudeAccounts(),
			entry: () => undefined,
			read: async () => [],
			refreshDue: async () => {},
			setSnapshotSink: () => {},
			setSnapshotSource: () => {},
			snapshot: () => ({ entries: [] }),
		},
		mover: {
			moveAtIdle: async () => ({
				movedTerminalIds: [],
				deferredTerminalIds: [],
			}),
			fallbackRestart: async () => true,
			corroborateLimitStop: async () => true,
			onExternalSwitch: async () => ({
				movedTerminalIds: [],
				deferredTerminalIds: [],
			}),
		},
		broadcast: {
			switched: (payload) => switched.push(payload),
			engineState: (payload) => states.push(payload),
		},
		now: () => T0,
		setIntervalFn: (() =>
			({ unref() {} }) as unknown as ReturnType<
				typeof setInterval
			>) as unknown as typeof setInterval,
		clearIntervalFn: (() => {}) as unknown as typeof clearInterval,
		platform: "linux",
		// A manual switch onto /profiles/b is how a test gives this process a
		// `lastWritten`. The real swap leaves the dir holding the target's
		// credential under the target's identity, so this one does too.
		swap: async () => {
			dir.current = { accountUuid: "acct-b", credentialHash: "hash-b" };
			return {
				ok: true,
				identity: {
					accountUuid: "acct-b",
					emailAddress: null,
					keys: { oauthAccount: { accountUuid: "acct-b" } },
				},
			};
		},
		seed: async () => ({
			ok: false,
			code: "owner-unknown",
			reason: "no login to seed in this test",
		}),
		ensureActiveDir: async () => ACTIVE_DIR,
		setPointer: () => {},
		readPointerSelections: () => ({
			claudeConfigDir: ACTIVE_DIR,
			codexHome: null,
		}),
		updateClaudeStateFile: async (_path, mutate) => {
			reasserted.push(mutate({}) as Record<string, unknown>);
		},
		setBindingRecorder: () => {},
		resolveActiveDir: () => ACTIVE_DIR,
		readActiveIdentity: async () => dir.current,
		readCodexIdentity: async () => null,
	});
	expect(engine.setSettings("claude", { enabled: true }).ok).toBe(true);
	return { engine, state, switched, states, reasserted, dir };
}

/** The account the runtime file records as active right now. */
function persistedActive(state: EngineState): string | null {
	return state.readRuntime().perAgent.claude.activeAccountId;
}

describe("an active dir whose identity drifted", () => {
	let home: string;
	let previousHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-account-engine-drift-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("adopts nothing when this process has never written the dir", async () => {
		// A host-service that just started: `lastWritten` is null, and the dir
		// names an account other than the recorded one. Whose credential is in
		// it cannot be told from here.
		const h = harness();
		h.dir.current = { accountUuid: "acct-b", credentialHash: "hash-b" };

		await h.engine.tick();

		expect(h.switched).toEqual([]);
		expect(persistedActive(h.state)).toBe("acct-a");
		expect(h.state.readHistory()).toEqual([]);
		// Parked, and said once: the Usage page shows the switch failure the
		// ambiguous pair raises.
		expect(
			h.states
				.filter((payload) => payload.lastSwitchFailure !== undefined)
				.map((payload) => payload.lastSwitchFailure?.code),
		).toEqual(["owner-unknown"]);

		// And it stays parked rather than adopting on the next tick.
		await h.engine.tick();

		expect(h.switched).toEqual([]);
		expect(persistedActive(h.state)).toBe("acct-a");
	});

	it("still re-asserts its own identity block after it has written the dir", async () => {
		// CONTROL. A switch this process performed, then a running Claude Code
		// rewriting `.claude.json` from the identity it started with: the
		// credential is still the one we wrote, so only the block drifted.
		const h = harness();
		expect((await h.engine.switchManually("claude", "/profiles/b")).ok).toBe(
			true,
		);
		h.dir.current = { accountUuid: "acct-a", credentialHash: "hash-b" };

		await h.engine.tick();

		expect(h.reasserted).toEqual([{ oauthAccount: { accountUuid: "acct-b" } }]);
		expect(persistedActive(h.state)).toBe("acct-b");
		// Nothing was adopted: the only switch on the bus is the manual one.
		expect(h.switched.map((payload) => payload.reasonKind)).toEqual(["manual"]);
	});

	it("still parks on a pair it cannot tell apart after it has written the dir", async () => {
		// CONTROL. The credential changed *and* the block names the account the
		// switch moved away from: a token refresh by the CLI that was running
		// through the switch, or a `/login` back into it, and nothing local
		// says which.
		const h = harness();
		expect((await h.engine.switchManually("claude", "/profiles/b")).ok).toBe(
			true,
		);
		h.dir.current = { accountUuid: "acct-a", credentialHash: "hash-refreshed" };

		await h.engine.tick();

		expect(h.reasserted).toEqual([]);
		expect(persistedActive(h.state)).toBe("acct-b");
		expect(h.switched.map((payload) => payload.reasonKind)).toEqual(["manual"]);
		expect(
			h.states.filter(
				(payload) => payload.lastSwitchFailure?.code === "owner-unknown",
			),
		).toHaveLength(1);
	});

	it("parks on a login it has no account for rather than adopting it", async () => {
		// A `/login` inside a session, into an account that lives in no profile
		// dir. `discoverClaudeProfiles` skips the active dir, so that account
		// has no pool row and never will: adopting it would leave
		// `activeAccountId` naming a row that does not exist, and from then on
		// every tick finds no active row and every manual switch is refused as
		// `owner-unknown`, with nothing that can undo it.
		const h = harness();
		expect((await h.engine.switchManually("claude", "/profiles/b")).ok).toBe(
			true,
		);
		h.dir.current = { accountUuid: "acct-z", credentialHash: "hash-z" };

		await h.engine.tick();

		// Nothing adopted: the only switch on the bus is the manual one, and the
		// runtime still names an account the pool has.
		expect(h.switched.map((payload) => payload.toAccountId)).toEqual([
			"acct-b",
		]);
		expect(persistedActive(h.state)).toBe("acct-b");
		expect(h.state.readRuntime().perAgent.claude.activeSelection).toBe(
			"/profiles/b",
		);
		expect(
			h.states.filter(
				(payload) => payload.lastSwitchFailure?.code === "owner-unknown",
			),
		).toHaveLength(1);

		// The point of the park: switching still works afterwards.
		expect((await h.engine.switchManually("claude", "/profiles/a")).ok).toBe(
			true,
		);
	});

	it("still adopts a third account's login after it has written the dir", async () => {
		// CONTROL. A `/login` inside a session, on a host that wrote this dir:
		// the block names neither the recorded account nor the one the switch
		// moved away from, so nothing is in doubt and the adoption stands.
		const h = harness();
		expect((await h.engine.switchManually("claude", "/profiles/b")).ok).toBe(
			true,
		);
		h.dir.current = { accountUuid: "acct-c", credentialHash: "hash-c" };

		await h.engine.tick();

		expect(h.switched.map((payload) => payload.toAccountId)).toEqual([
			"acct-b",
			"acct-c",
		]);
		expect(persistedActive(h.state)).toBe("acct-c");
	});
});
