/**
 * The recorded active selection is a record, not a guess. One provider account
 * can be reachable from two dirs, and when the recorded one drops out of the
 * pool — a profile dir not mounted yet, a provider read that failed — the
 * first-match fallback names the sibling dir instead. `resolveActive` used to
 * write that back, and `persistRuntime` made it permanent: from then on the
 * engine believes sessions run from a dir they were never launched from, and
 * nothing heals it (switching onto the account the Usage tab names is the
 * same-account no-op). The fallback still belongs in `activeRow`, where it
 * only feeds a decision.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../db/index.ts";
import type { AccountSwitchedPayload } from "../events/types.ts";
import type { UsageAccount } from "../trpc/router/usage/types.ts";
import { AccountEngine } from "./account-engine.ts";
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

/**
 * The recorded dir, /profiles/a, is not in the pool: what is left for acct-a
 * is the second dir signed into the same account. `usedPercent` decides
 * whether this tick has a switch to make.
 */
function poolWithSiblingDir(activeUsedPercent: number): QuotaEntry[] {
	return [
		entryFor(
			usageAccount({
				accountKey: "key-a2",
				selection: "/profiles/a2",
				windows: [
					{
						id: "five_hour",
						label: "Session (5h)",
						usedPercent: activeUsedPercent,
						resetsAt: null,
					},
				],
			}),
		),
		entryFor(
			usageAccount({
				accountKey: "key-b",
				accountId: "acct-b",
				selection: "/profiles/b",
				email: "b@example.com",
			}),
		),
	];
}

function engineOver(
	state: EngineState,
	entries: QuotaEntry[],
	switched: AccountSwitchedPayload[],
): AccountEngine {
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
			entries: () => entries,
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
			observeLimitStop: async () => ({
				model: null,
				source: "terminal" as const,
			}),
			onExternalSwitch: async () => ({
				movedTerminalIds: [],
				deferredTerminalIds: [],
			}),
		},
		broadcast: {
			switched: (payload) => switched.push(payload),
			engineState: () => {},
		},
		now: () => T0,
		setIntervalFn: (() =>
			({ unref() {} }) as unknown as ReturnType<
				typeof setInterval
			>) as unknown as typeof setInterval,
		clearIntervalFn: (() => {}) as unknown as typeof clearInterval,
		platform: "linux",
		swap: async () => ({
			ok: true,
			identity: {
				accountUuid: "acct-b",
				emailAddress: null,
				keys: { oauthAccount: { accountUuid: "acct-b" } },
			},
		}),
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
		updateClaudeStateFile: async () => {},
		setBindingRecorder: () => {},
		resolveActiveDir: () => ACTIVE_DIR,
		// The dir holds the login the runtime records, so the identity
		// re-assertion has nothing to say here.
		readActiveIdentity: async () => ({
			accountUuid: "acct-a",
			credentialHash: "hash-a",
		}),
		readCodexIdentity: async () => null,
	});
	expect(engine.setSettings("claude", { enabled: true }).ok).toBe(true);
	return engine;
}

/** The runtime as it stands on disk. */
function persisted(home: string): {
	activeAccountId: string | null;
	activeSelection: string | null;
} {
	const written = JSON.parse(
		readFileSync(join(home, "state", "account-engine", "runtime.json"), "utf8"),
	) as {
		perAgent: {
			claude: {
				activeAccountId: string | null;
				activeSelection: string | null;
			};
		};
	};
	const { activeAccountId, activeSelection } = written.perAgent.claude;
	return { activeAccountId, activeSelection };
}

describe("the recorded active selection", () => {
	let home: string;
	let previousHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-account-engine-selection-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	function seedRuntime(): EngineState {
		const state = new EngineState();
		const runtime = state.readRuntime();
		runtime.perAgent.claude.activeAccountId = "acct-a";
		runtime.perAgent.claude.activeSelection = "/profiles/a";
		state.writeRuntime(runtime);
		return state;
	}

	it("survives a tick where only the sibling dir is in the pool", async () => {
		const switched: AccountSwitchedPayload[] = [];
		// Nothing is due: this tick only resolves and persists.
		const engine = engineOver(seedRuntime(), poolWithSiblingDir(10), switched);

		await engine.tick();

		expect(switched).toEqual([]);
		expect(persisted(home)).toEqual({
			activeAccountId: "acct-a",
			activeSelection: "/profiles/a",
		});
	});

	it("still lets the tick decide against the account it names", async () => {
		// The fallback the record must not take is the one a decision needs:
		// without a row for the active account `evaluate` returns early and the
		// engine stops switching altogether.
		const switched: AccountSwitchedPayload[] = [];
		const engine = engineOver(seedRuntime(), poolWithSiblingDir(95), switched);

		await engine.tick();

		expect(
			switched.map((payload) => [payload.fromAccountId, payload.toAccountId]),
		).toEqual([["acct-a", "acct-b"]]);
		expect(persisted(home)).toEqual({
			activeAccountId: "acct-b",
			activeSelection: "/profiles/b",
		});
	});
});
