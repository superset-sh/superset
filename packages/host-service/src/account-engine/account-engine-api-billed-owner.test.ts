/**
 * An API-billed profile has no OAuth login to save back. Returning to OAuth
 * seeds an empty active dir without assigning a credential to either API
 * profile. An existing OAuth owner still binds by account id.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../db/index.ts";
import type { UsageAccount } from "../trpc/router/usage/types.ts";
import { AccountEngine } from "./account-engine.ts";
import {
	seedActiveClaudeLogin,
	type swapClaudeLogin,
} from "./claude-login-swap.ts";
import { EngineState } from "./engine-state.ts";
import type { AccountEngineHostDeps } from "./host-deps.ts";
import type { QuotaEntry } from "./quota-store.ts";

const T0 = 1_800_000_000_000;
const ACTIVE_DIR = "/superset-home/accounts/claude-active";

type SwapInput = Parameters<typeof swapClaudeLogin>[0];

function usageAccount(over: Partial<UsageAccount>): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey: "key-b",
		accountId: "acct-b",
		sourceLabel: "~/.claude",
		email: "b@example.com",
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
		selection: "/profiles/b",
		isDefault: false,
		inRotation: true,
		managed: true,
		fetchedAt: new Date(T0),
		...over,
	};
}

/** What `claudeApiKeyAccount` builds: no id, no windows, out of rotation. */
function apiBilled(selection: string, accountKey: string): UsageAccount {
	return usageAccount({
		accountKey,
		accountId: null,
		selection,
		credentialKind: "api_key",
		email: null,
		sourceLabel: selection,
		plan: null,
		windows: [],
		inRotation: false,
	});
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

let swaps: SwapInput[] = [];
let seeds: Parameters<typeof seedActiveClaudeLogin>[0][] = [];

function engineOver(state: EngineState, entries: QuotaEntry[]): AccountEngine {
	const home = process.env.SUPERSET_HOME_DIR as string;
	const targetDir = join(home, "target");
	const activeDir = join(home, "active");
	for (const dir of [targetDir, activeDir]) mkdirSync(dir, { mode: 0o700 });
	writeFileSync(
		join(targetDir, ".credentials.json"),
		JSON.stringify({
			claudeAiOauth: {
				accessToken: "target-b",
				refreshToken: "refresh-b",
				expiresAt: T0 + 60_000,
			},
		}),
	);
	writeFileSync(
		join(targetDir, ".claude.json"),
		JSON.stringify({ oauthAccount: { accountUuid: "acct-b" } }),
	);
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
		broadcast: { switched: () => {}, engineState: () => {} },
		now: () => T0,
		setIntervalFn: (() =>
			({ unref() {} }) as unknown as ReturnType<
				typeof setInterval
			>) as unknown as typeof setInterval,
		clearIntervalFn: (() => {}) as unknown as typeof clearInterval,
		platform: "linux",
		swap: async (input) => {
			swaps.push(input);
			return {
				ok: true,
				identity: {
					accountUuid: "acct-b",
					emailAddress: null,
					keys: { oauthAccount: { accountUuid: "acct-b" } },
				},
			};
		},
		seed: async (input) => {
			seeds.push(input);
			return seedActiveClaudeLogin({
				...input,
				source: { kind: "profile", dir: targetDir },
				activeDir,
				deps: { darwin: false, homeDir: home },
			});
		},
		ensureActiveDir: async () => ACTIVE_DIR,
		setPointer: () => {},
		readPointerSelections: () => ({
			claudeConfigDir: ACTIVE_DIR,
			codexHome: null,
		}),
		updateClaudeStateFile: async () => {},
		setBindingRecorder: () => {},
		resolveActiveDir: () => ACTIVE_DIR,
		// An API-billed login names no account, which is the whole point.
		readActiveIdentity: async () => ({
			accountUuid: null,
			credentialHash: null,
		}),
		readCodexIdentity: async () => null,
	});
	expect(engine.setSettings("claude", { enabled: true }).ok).toBe(true);
	return engine;
}

describe("the owner of an API-billed active login", () => {
	let home: string;
	let previousHome: string | undefined;

	beforeEach(() => {
		swaps = [];
		seeds = [];
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-account-engine-api-billed-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	/** The active row as the engine records it: an id when there is one. */
	function seedRuntime(
		activeAccountId: string | null,
		activeSelection: string,
	): EngineState {
		const state = new EngineState();
		const runtime = state.readRuntime();
		runtime.perAgent.claude.activeAccountId = activeAccountId;
		runtime.perAgent.claude.activeSelection = activeSelection;
		state.writeRuntime(runtime);
		return state;
	}

	it("switches away by seeding OAuth without saving back to the API profile", async () => {
		const engine = engineOver(seedRuntime(null, "/profiles/api"), [
			entryFor(apiBilled("/profiles/api", "key-api")),
			entryFor(usageAccount({})),
		]);

		const outcome = await engine.switchManually("claude", "/profiles/b");

		expect(outcome).toEqual({ ok: true });
		expect(swaps).toEqual([]);
		expect(seeds.map((input) => input.source)).toEqual([
			{ kind: "profile", dir: "/profiles/b" },
		]);
		expect(
			JSON.parse(
				readFileSync(join(home, "active", ".credentials.json"), "utf8"),
			).claudeAiOauth.accessToken,
		).toBe("target-b");
	});

	/**
	 * The guard on the fix, and the one that must hold however it is written:
	 * two id-less rows are indistinguishable by id. Neither may receive an
	 * OAuth save-back when leaving an API-only profile.
	 */
	for (const active of ["/profiles/api", "/profiles/api2"]) {
		it(`leaves ${active} without writing either id-less profile`, async () => {
			const engine = engineOver(seedRuntime(null, active), [
				entryFor(apiBilled("/profiles/api", "key-api")),
				entryFor(apiBilled("/profiles/api2", "key-api2")),
				entryFor(usageAccount({})),
			]);

			const outcome = await engine.switchManually("claude", "/profiles/b");

			expect(outcome).toEqual({ ok: true });
			expect(swaps).toEqual([]);
			expect(seeds.map((input) => input.source)).toEqual([
				{ kind: "profile", dir: "/profiles/b" },
			]);
		});
	}

	it("still binds an OAuth active by its account id", async () => {
		const engine = engineOver(seedRuntime("acct-a", "/profiles/a"), [
			entryFor(
				usageAccount({
					accountKey: "key-a",
					accountId: "acct-a",
					selection: "/profiles/a",
					email: "a@example.com",
				}),
			),
			entryFor(usageAccount({})),
		]);

		const outcome = await engine.switchManually("claude", "/profiles/b");

		expect(outcome).toEqual({ ok: true });
		expect(swaps.map((input) => input.ownerBinding)).toEqual([
			{ kind: "profile", dir: "/profiles/a" },
		]);
		// The id is what it stands for, so the swap can refuse a save-back into
		// a dir that was re-authenticated since the decision.
		expect(swaps[0]?.expectedOwnerAccountId).toBe("acct-a");
	});
});
