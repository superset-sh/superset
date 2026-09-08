/**
 * A Codex switch is the pointer alone, but the home it points at is a whole
 * config root: an auto-switch can land on any `~/.codex*` dir with a parsable
 * auth.json, including one that never passed the add-account flow. Unless the
 * switch provisions it, sessions do not pool into the ambient home and the
 * mover's `codex resume` cannot find the rollout it just moved.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
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
		entries?: QuotaEntry[];
		onMove?: () => void;
		readCodexIdentity?: (selection: string | null) => Promise<string | null>;
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
			entries: () => deps.entries ?? twoCodexHomes(),
			entry: () => undefined,
			read: async () => [],
			refreshDue: async () => {},
			setSnapshotSink: () => {},
			setSnapshotSource: () => {},
			snapshot: () => ({ entries: [] }),
		},
		mover: {
			moveAtIdle: async () => {
				deps.onMove?.();
				return { movedTerminalIds: [], deferredTerminalIds: [] };
			},
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
		swap: async () => {
			throw new Error("Codex provisioning must not swap Claude credentials");
		},
		seed: async () => {
			throw new Error("Codex provisioning must not seed Claude credentials");
		},
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
		readCodexIdentity:
			deps.readCodexIdentity ??
			(async (selection) =>
				selection === "/homes/b" ? "codex-acct-b" : "codex-acct-a"),
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

	it("contains startup lock errors and retries through the guarded tick", async () => {
		const state = new EngineState();
		const claimLock = state.claimLock.bind(state);
		let claims = 0;
		let writable = false;
		state.claimLock = (...args) => {
			claims++;
			if (!writable) throw new Error("EACCES: state directory is not writable");
			return claimLock(...args);
		};
		const pointerWrites: Array<string | null> = [];
		const engine = buildEngine(state, {
			pointerWrites,
			provisionCodex: async () => {
				throw new Error("Disabled automation must not provision accounts");
			},
		});
		try {
			expect(state.readSettings().codex.enabled).toBe(false);
			expect(state.readSettings().claude.enabled).toBe(false);
			expect(() => engine.start()).not.toThrow();
			expect(claims).toBe(1);
			await engine.tick();
			expect(claims).toBe(2);
			expect(existsSync(join(state.dir, "engine.lock"))).toBe(false);
			writable = true;
			await engine.tick();
			expect(claims).toBeGreaterThan(2);
			expect(existsSync(join(state.dir, "engine.lock"))).toBe(true);
			expect(pointerWrites).toEqual([]);
			expect(state.readHistory()).toEqual([]);
		} finally {
			await engine.stop();
		}
	});

	for (const mode of ["automatic", "manual"] as const) {
		for (const changed of [false, true]) {
			it(`${mode} validates the subscription identity after provisioning (changed=${changed})`, async () => {
				const state = new EngineState();
				const before = state.readRuntime();
				before.perAgent.codex.activeAccountId = "codex-acct-a";
				before.perAgent.codex.activeSelection = "/homes/a";
				state.writeRuntime(before);
				const authPath = join(home, "auth.json");
				const writeIdentity = (id: string) =>
					writeFileSync(
						authPath,
						JSON.stringify({ tokens: { account_id: id } }),
					);
				writeIdentity("codex-acct-b");
				const entries = twoCodexHomes();
				for (const [index, entry] of entries.entries()) {
					for (const account of entry.accounts) {
						account.windows = [
							{
								id: "primary",
								label: "Session",
								usedPercent: index === 0 ? 95 : 10,
								resetsAt: null,
							},
						];
					}
				}
				const pointerWrites: Array<string | null> = [];
				let moves = 0;
				let provisioned = false;
				const engine = buildEngine(state, {
					entries,
					pointerWrites,
					readCodexIdentity: async (selection) =>
						selection === "/homes/b"
							? JSON.parse(readFileSync(authPath, "utf8")).tokens.account_id
							: "codex-acct-a",
					provisionCodex: async () => {
						await Promise.resolve();
						if (changed) writeIdentity("codex-acct-c");
						provisioned = true;
					},
					onMove: () => {
						moves++;
					},
				});
				try {
					expect(engine.setSettings("codex", { enabled: true }).ok).toBe(true);
					const outcome =
						mode === "manual"
							? await engine.switchManually("codex", "/homes/b")
							: await engine.tick();
					if (mode === "manual")
						expect(outcome).toMatchObject(
							changed ? { ok: false, code: "target-changed" } : { ok: true },
						);
					expect(provisioned).toBe(true);
					expect(pointerWrites).toEqual(changed ? [] : ["/homes/b"]);
					expect(state.readRuntime().perAgent.codex.activeAccountId).toBe(
						changed ? "codex-acct-a" : "codex-acct-b",
					);
					expect(state.readRuntime().perAgent.codex.activeSelection).toBe(
						changed ? "/homes/a" : "/homes/b",
					);
					expect(state.readHistory()).toHaveLength(changed ? 0 : 1);
					expect(moves).toBe(changed ? 0 : 1);
				} finally {
					await engine.stop();
				}
			});
		}
		for (const change of ["disable", "exclude"] as const) {
			it(`${mode} switch respects ${change} during provisioning`, async () => {
				const state = new EngineState();
				const before = state.readRuntime();
				before.perAgent.codex.activeAccountId = "codex-acct-a";
				before.perAgent.codex.activeSelection = "/homes/a";
				state.writeRuntime(before);
				const entries = twoCodexHomes();
				for (const [index, entry] of entries.entries()) {
					for (const account of entry.accounts) {
						account.windows = [
							{
								id: "primary",
								label: "Session",
								usedPercent: index === 0 ? 95 : 10,
								resetsAt: null,
							},
						];
					}
				}
				let release = () => {};
				let entered = () => {};
				const gate = new Promise<void>((resolve) => {
					release = resolve;
				});
				const provisioning = new Promise<void>((resolve) => {
					entered = resolve;
				});
				const pointerWrites: Array<string | null> = [];
				let moves = 0;
				const engine = buildEngine(state, {
					entries,
					pointerWrites,
					provisionCodex: async () => {
						entered();
						await gate;
					},
					onMove: () => {
						moves++;
					},
				});
				expect(engine.setSettings("codex", { enabled: true }).ok).toBe(true);
				const operation =
					mode === "manual"
						? engine.switchManually("codex", "/homes/b")
						: engine.tick();
				try {
					await provisioning;
					expect(
						change === "disable"
							? engine.setSettings("codex", { enabled: false }).ok
							: engine.setRotation("codex:codex-acct-b", false).ok,
					).toBe(true);
					release();
					await operation;
					const switched = mode === "manual";
					expect(pointerWrites).toEqual(switched ? ["/homes/b"] : []);
					expect(state.readRuntime().perAgent.codex.activeSelection).toBe(
						switched ? "/homes/b" : "/homes/a",
					);
					expect(state.readRuntime().perAgent.codex.activeAccountId).toBe(
						switched ? "codex-acct-b" : "codex-acct-a",
					);
					expect(state.readHistory()).toHaveLength(switched ? 1 : 0);
					expect(moves).toBe(switched ? 1 : 0);
				} finally {
					release();
					await operation;
					await engine.stop();
				}
			});
		}
	}

	for (const shape of [
		"missing",
		"malformed",
		"unreadable",
		"empty",
		"wrong-type",
		"null",
		"valid",
	] as const) {
		it(`validates ${shape} API credentials before publishing a Codex switch`, async () => {
			const target = join(home, "api-home");
			mkdirSync(target);
			writeFileSync(join(target, ".superset-api-billing"), "codex");
			const authPath = join(target, "auth.json");
			if (shape === "unreadable") mkdirSync(authPath);
			else if (shape !== "missing")
				writeFileSync(
					authPath,
					shape === "malformed"
						? "{"
						: shape === "null"
							? "null"
							: JSON.stringify({
									auth_mode: "apikey",
									OPENAI_API_KEY:
										shape === "valid"
											? "sk-test"
											: shape === "wrong-type"
												? 42
												: "  ",
								}),
				);
			const state = new EngineState();
			const before = state.readRuntime();
			before.perAgent.codex.activeAccountId = "codex-acct-a";
			before.perAgent.codex.activeSelection = "/homes/a";
			state.writeRuntime(before);
			const pointerWrites: Array<string | null> = [];
			let moves = 0;
			const engine = buildEngine(state, {
				pointerWrites,
				provisionCodex: async () => {},
				onMove: () => {
					moves++;
				},
				entries: [
					entryFor(codexAccount({})),
					entryFor(
						codexAccount({
							accountKey: "api",
							accountId: null,
							selection: target,
							credentialKind: "api_key",
							windows: [],
						}),
					),
				],
			});
			const outcome = await engine.switchManually("codex", target);
			if (shape === "valid") {
				expect(outcome).toEqual({ ok: true });
				expect(pointerWrites).toEqual([target]);
				expect(state.readRuntime().perAgent.codex.activeSelection).toBe(target);
				expect(state.readHistory()).toHaveLength(1);
				expect(moves).toBe(1);
			} else {
				expect(outcome).toMatchObject({ ok: false, code: "no-target-login" });
				expect(pointerWrites).toEqual([]);
				expect(state.readRuntime()).toEqual(before);
				expect(state.readHistory()).toEqual([]);
				expect(moves).toBe(0);
			}
		});
	}

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

		// The share is best-effort and runs before the pointer: a home that
		// could not be shared must not report a switch that did happen as
		// failed, and the pointer still moves.
		expect(outcome.ok).toBe(true);
		expect(pointerWrites).toEqual(["/homes/b"]);
	});

	it("writes no pointer when the lock is lost while the home is provisioned", async () => {
		const state = new EngineState();
		// What this host believes before the switch: sessions are on home A.
		const before = state.readRuntime();
		before.perAgent.codex.activeAccountId = "codex-acct-a";
		before.perAgent.codex.activeSelection = "/homes/a";
		state.writeRuntime(before);

		const pointerWrites: Array<string | null> = [];
		const stops: Array<Promise<void>> = [];
		const engine = buildEngine(state, {
			// Another instance takes the host lock while the share is in flight.
			provisionCodex: async () => {
				stops.push(engine.stop());
			},
			pointerWrites,
		});

		const outcome = await engine.switchManually("codex", "/homes/b");
		await Promise.all(stops);

		expect(outcome).toMatchObject({ ok: false, code: "lock-loser" });
		// R24: a switch that did not complete changes nothing at all. The
		// pointer is the Codex switch — it is what the next terminal reads as
		// CODEX_HOME — so a pointer on B against a runtime naming A is a host
		// nothing on any path reconciles.
		expect(pointerWrites).toEqual([]);
		const after = state.readRuntime().perAgent.codex;
		expect(after.activeSelection).toBe("/homes/a");
		expect(after.activeAccountId).toBe("codex-acct-a");
		expect(state.readHistory()).toEqual([]);
	});
});
