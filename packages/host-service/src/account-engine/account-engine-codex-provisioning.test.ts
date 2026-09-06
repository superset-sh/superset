/**
 * A Codex switch is the pointer alone, but the home it points at is a whole
 * config root: an auto-switch can land on any `~/.codex*` dir with a parsable
 * auth.json, including one that never passed the add-account flow. Unless the
 * switch provisions it, sessions do not pool into the ambient home and the
 * mover's `codex resume` cannot find the rollout it just moved.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
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

function codexAccount(over: Partial<UsageAccount>): UsageAccount {
	return {
		agent: "codex",
		credentialKind: "subscription",
		accountKey: "codex-a",
		accountId: "codex-acct-a",
		sourceLabel: "~/.codex",
		email: "a@example.com",
		plan: "pro",
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
		selection: "/homes/a",
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

/** Active home A, plus the home B the switch targets. */
function twoCodexHomes(): QuotaEntry[] {
	return [
		entryFor(codexAccount({ isDefault: true })),
		entryFor(
			codexAccount({
				accountKey: "codex-b",
				accountId: "codex-acct-b",
				selection: "/homes/b",
				email: "b@example.com",
			}),
		),
	];
}

function buildEngine(
	state: EngineState,
	deps: {
		provisionCodex: (codexHome: string) => Promise<void>;
		pointerWrites: Array<string | null>;
	},
): AccountEngine {
	return new AccountEngine({
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
			entries: () => twoCodexHomes(),
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
		swap: async () => ({ ok: false, code: "swap-failed", reason: "unused" }),
		seed: async () => ({ ok: false, code: "swap-failed", reason: "unused" }),
		ensureActiveDir: async () => ACTIVE_DIR,
		provisionCodex: deps.provisionCodex,
		setPointer: (_db, _agent, selection) => {
			deps.pointerWrites.push(selection);
		},
		readPointerSelections: () => ({
			claudeConfigDir: null,
			codexHome: "/homes/a",
		}),
		updateClaudeStateFile: async () => {},
		setBindingRecorder: () => {},
		resolveActiveDir: () => ACTIVE_DIR,
		readActiveIdentity: async () => ({
			accountUuid: null,
			credentialHash: null,
		}),
		// The target home is signed in as exactly the account the switch expects.
		readCodexIdentity: async (selection) =>
			selection === "/homes/b" ? "codex-acct-b" : "codex-acct-a",
	});
}

describe("AccountEngine Codex switches", () => {
	let home: string;
	let previousHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-account-engine-codex-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("provisions the Codex home it switches onto", async () => {
		const provisioned: string[] = [];
		const pointerWrites: Array<string | null> = [];
		const engine = buildEngine(new EngineState(), {
			provisionCodex: async (codexHome) => {
				provisioned.push(codexHome);
			},
			pointerWrites,
		});

		const outcome = await engine.switchManually("codex", "/homes/b");

		expect(outcome.ok).toBe(true);
		expect(pointerWrites).toEqual(["/homes/b"]);
		// Without this the mover restarts Codex with `codex resume <id>` on a
		// home whose sessions/ never joined the ambient pool.
		expect(provisioned).toEqual(["/homes/b"]);
	});

	it("keeps the switch successful when provisioning the home fails", async () => {
		const pointerWrites: Array<string | null> = [];
		const engine = buildEngine(new EngineState(), {
			provisionCodex: async () => {
				throw new Error("share failed");
			},
			pointerWrites,
		});

		const outcome = await engine.switchManually("codex", "/homes/b");

		// The pointer is already written: a failed share must not report a
		// switch that plainly happened as failed.
		expect(outcome.ok).toBe(true);
		expect(pointerWrites).toEqual(["/homes/b"]);
	});
});
