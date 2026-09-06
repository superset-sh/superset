/**
 * KTD3/KTD5: the tick writes `runtime.json` whole, and discovery — which runs
 * unlocked in every host-service on this machine — writes identity bindings
 * into the same file while the tick is awaiting its I/O. What the tick puts
 * back has to be the file as it stands plus this tick's own bindings, never
 * the copy it started from.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../db/index.ts";
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

/** Active account A at 91%, spare account B at 20%: one switch is due. */
function twoClaudeAccounts(): QuotaEntry[] {
	return [
		entryFor(
			usageAccount({
				isDefault: true,
				windows: [
					{
						id: "five_hour",
						label: "Session (5h)",
						usedPercent: 91,
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
				windows: [
					{
						id: "five_hour",
						label: "Session (5h)",
						usedPercent: 20,
						resetsAt: null,
					},
				],
			}),
		),
	];
}

describe("AccountEngine runtime writes", () => {
	let home: string;
	let previousHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-account-engine-runtime-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("keeps the bindings discovery wrote under the tick, and the one it retired stays retired", async () => {
		const state = new EngineState();
		const seedRuntime = state.readRuntime();
		// The binding discovery is about to retire: /profiles/b has been
		// re-authenticated as acct-b since this was recorded.
		seedRuntime.identityBindings["acct-old"] = "/profiles/b";
		state.writeRuntime(seedRuntime);

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
				entries: () => twoClaudeAccounts(),
				entry: () => undefined,
				read: async () => [],
				refreshDue: async () => {},
				setSnapshotSink: () => {},
				setSnapshotSource: () => {},
				snapshot: () => ({ entries: [] }),
			},
			mover: {
				// The session move is the tick's last await before it writes.
				// Discovery, holding no lock, records what it just found and
				// retires the claim /profiles/b's previous account had on it.
				moveAtIdle: async () => {
					const live = state.readRuntime();
					delete live.identityBindings["acct-old"];
					live.identityBindings["acct-c"] = "/profiles/c";
					state.writeRuntime(live);
					return { movedTerminalIds: [], deferredTerminalIds: [] };
				},
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
			swap: async () => ({
				ok: true,
				identity: {
					accountUuid: "acct-b",
					emailAddress: null,
					keys: { oauthAccount: { accountUuid: "acct-b" } },
				},
			}),
			seed: async () => ({
				ok: true,
				identity: {
					accountUuid: "acct-a",
					emailAddress: null,
					keys: { oauthAccount: { accountUuid: "acct-a" } },
				},
			}),
			ensureActiveDir: async () => ACTIVE_DIR,
			setPointer: () => {},
			readPointerSelections: () => ({
				claudeConfigDir: null,
				codexHome: null,
			}),
			updateClaudeStateFile: async () => {},
			setBindingRecorder: () => {},
			resolveActiveDir: () => ACTIVE_DIR,
			readActiveIdentity: async () => ({
				accountUuid: "acct-a",
				credentialHash: "hash-a",
			}),
			readCodexIdentity: async () => null,
		});
		expect(engine.setSettings("claude", { enabled: true }).ok).toBe(true);

		await engine.tick();

		const written = JSON.parse(
			readFileSync(
				join(home, "state", "account-engine", "runtime.json"),
				"utf8",
			),
		) as { identityBindings: Record<string, string | null> };
		// This tick's own binding, and the one discovery recorded under it.
		expect(written.identityBindings["acct-b"]).toBe("/profiles/b");
		expect(written.identityBindings["acct-c"]).toBe("/profiles/c");
		// Retired while the tick ran, and the tick's write must not bring it
		// back: the next swap would save acct-b's refreshed credential into
		// what it believes is acct-old's store.
		expect("acct-old" in written.identityBindings).toBe(false);
	});
});
