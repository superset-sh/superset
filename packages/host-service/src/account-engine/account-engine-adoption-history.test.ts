/**
 * KTD3: someone ran `/login` inside a session, so the active dir holds a
 * credential this host did not write — behind a switch this host *did* write,
 * which is what tells the two readings apart. The tick adopts it — and the
 * history row
 * that records the adoption is a log line, not the adoption itself. A history
 * file that cannot be appended to (a full disk, a state dir gone read-only for
 * this process) must not cost the tick its decision: without the guard the
 * throw escapes to `tick()`, nothing is persisted, `account:switched` never
 * fires, and the next tick reads the same unknown login and does it again.
 * `writeRuntime` is rename-based and still succeeds in that state.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../db/index.ts";
import type { UsageAccount } from "../trpc/router/usage/types.ts";
import { AccountEngine, type ActiveDirIdentity } from "./account-engine.ts";
import type { ClaudeSwapResult } from "./claude-login-swap.ts";
import { EngineState } from "./engine-state.ts";
import type { AccountEngineHostDeps } from "./host-deps.ts";
import type { QuotaEntry } from "./quota-store.ts";
import type { HistoryEntry } from "./types.ts";

const T0 = 1_800_000_000_000;
const ACTIVE_DIR = "/superset-home/accounts/claude-active";
/** Nothing is seeded here: the active dir already holds a login. */
const NO_SEED: ClaudeSwapResult = {
	ok: false,
	code: "owner-unknown",
	reason: "no login to seed in this test",
};

/**
 * The state dir whose history file stops taking rows — from `failing` on, so
 * the switch that gives this host a `lastWritten` still records itself.
 */
class UnwritableHistory extends EngineState {
	failing = false;

	override appendHistory(entry: HistoryEntry): void {
		if (this.failing) throw new Error("ENOSPC: no space left on device");
		super.appendHistory(entry);
	}
}

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

/** All well under the threshold: nothing here is due a switch. */
function threeClaudeAccounts(): QuotaEntry[] {
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

describe("adopting a login the host did not write", () => {
	let home: string;
	let previousHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-account-engine-adopt-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("keeps the adoption when the history row cannot be written", async () => {
		const state = new UnwritableHistory();
		const runtime = state.readRuntime();
		// What this host believes is active before its own switch.
		runtime.perAgent.claude.activeAccountId = "acct-a";
		runtime.perAgent.claude.activeSelection = "/profiles/a";
		state.writeRuntime(runtime);
		// What the active dir holds; the switch below moves it, and the
		// `/login` moves it again.
		const dir: { current: ActiveDirIdentity } = {
			current: { accountUuid: "acct-a", credentialHash: "hash-a" },
		};

		const switched: { toAccountId: string | null }[] = [];
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
				entries: () => threeClaudeAccounts(),
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
				switched: (payload) => {
					switched.push({ toAccountId: payload.toAccountId });
				},
				engineState: () => {},
			},
			now: () => T0,
			setIntervalFn: (() =>
				({ unref() {} }) as unknown as ReturnType<
					typeof setInterval
				>) as unknown as typeof setInterval,
			clearIntervalFn: (() => {}) as unknown as typeof clearInterval,
			platform: "linux",
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
			seed: async () => NO_SEED,
			ensureActiveDir: async () => ACTIVE_DIR,
			setPointer: () => {},
			readPointerSelections: () => ({
				claudeConfigDir: ACTIVE_DIR,
				codexHome: null,
			}),
			updateClaudeStateFile: async () => {},
			setBindingRecorder: () => {},
			resolveActiveDir: () => ACTIVE_DIR,
			readActiveIdentity: async () => dir.current,
			readCodexIdentity: async () => null,
		});
		expect(engine.setSettings("claude", { enabled: true }).ok).toBe(true);
		// This host's own switch, so it knows what it last wrote — without that
		// the tick below parks instead of adopting.
		expect((await engine.switchManually("claude", "/profiles/b")).ok).toBe(
			true,
		);
		// A `/login` inside a session: a credential this host never wrote.
		dir.current = { accountUuid: "acct-c", credentialHash: "hash-c" };
		state.failing = true;

		await engine.tick();

		// The bus tells the desktop which login it is on now.
		expect(switched).toEqual([
			{ toAccountId: "acct-b" },
			{ toAccountId: "acct-c" },
		]);
		// And the adoption is persisted, so the next tick does not repeat it.
		const written = JSON.parse(
			readFileSync(
				join(home, "state", "account-engine", "runtime.json"),
				"utf8",
			),
		) as { perAgent: { claude: { activeAccountId: string | null } } };
		expect(written.perAgent.claude.activeAccountId).toBe("acct-c");
	});
});
