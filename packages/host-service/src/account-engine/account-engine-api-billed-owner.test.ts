/**
 * An API-billed login is active with no provider account id (R16 keeps it out
 * of rotation, nothing keeps it out of the active seat), and `ownerBinding`
 * refused every id-less owner outright — so every switch away from one, manual
 * or automatic, came back `owner-unknown` and the user was stuck on
 * pay-per-token billing. The id scan genuinely cannot serve such a row: a null
 * id matches every other id-less row. Its selection can, and does, because a
 * selection names exactly one store.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../db/index.ts";
import type { UsageAccount } from "../trpc/router/usage/types.ts";
import { AccountEngine } from "./account-engine.ts";
import type { swapClaudeLogin } from "./claude-login-swap.ts";
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

function engineOver(state: EngineState, entries: QuotaEntry[]): AccountEngine {
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
			corroborateLimitStop: async () => true,
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
		// An API-billed login names no account, which is the whole point.
		readActiveIdentity: async () => ({
			accountUuid: null,
			credentialHash: "hash-active",
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

	it("switches away, binding the save-back to the dir it is active from", async () => {
		const engine = engineOver(seedRuntime(null, "/profiles/api"), [
			entryFor(apiBilled("/profiles/api", "key-api")),
			entryFor(usageAccount({})),
		]);

		const outcome = await engine.switchManually("claude", "/profiles/b");

		expect(outcome).toEqual({ ok: true });
		expect(swaps.map((input) => input.ownerBinding)).toEqual([
			{ kind: "profile", dir: "/profiles/api" },
		]);
	});

	/**
	 * The guard on the fix, and the one that must hold however it is written:
	 * two id-less rows are indistinguishable by id, so a scan that ever sees
	 * one binds the save-back to whichever dir it happens to find and signs
	 * the other out. Its own dir or nothing — a refusal is safe, the sibling
	 * never is.
	 */
	for (const active of ["/profiles/api", "/profiles/api2"]) {
		it(`binds ${active} to itself, never to the other id-less row`, async () => {
			const engine = engineOver(seedRuntime(null, active), [
				entryFor(apiBilled("/profiles/api", "key-api")),
				entryFor(apiBilled("/profiles/api2", "key-api2")),
				entryFor(usageAccount({})),
			]);

			const outcome = await engine.switchManually("claude", "/profiles/b");

			expect(swaps.map((input) => input.ownerBinding)).toEqual(
				outcome.ok ? [{ kind: "profile", dir: active }] : [],
			);
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
