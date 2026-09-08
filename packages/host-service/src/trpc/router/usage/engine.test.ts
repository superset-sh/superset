import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TRPCError } from "@trpc/server";
import type { AccountEngine } from "../../../account-engine/account-engine.ts";
import { createLocalAccountService } from "../../../account-engine/account-service.ts";
import { defaultEngineSettings } from "../../../account-engine/engine-state.ts";
import { QuotaStore } from "../../../account-engine/quota-store.ts";
import type {
	AccountAgent,
	AutoSwitchSettings,
	EngineSettings,
	HistoryEntry,
	RotationState,
} from "../../../account-engine/types.ts";
import type { HostServiceContext } from "../../../types.ts";
import { usageRouter } from "./usage.ts";

const NOW = 1_700_000_000_000;

// The router reads the engine's state dir to tell a lock loser from a host
// whose state dir it cannot use, so every test here needs a Superset home of
// its own — never the developer's real one.
let home: string;
let previousHome: string | undefined;

function stateDir(): string {
	return join(home, "state", "account-engine");
}

beforeEach(() => {
	previousHome = process.env.SUPERSET_HOME_DIR;
	home = mkdtempSync(join(tmpdir(), "superset-usage-engine-"));
	process.env.SUPERSET_HOME_DIR = home;
	mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
});

afterEach(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(home, { recursive: true, force: true });
});

interface FakeOptions {
	platformSupported?: boolean;
	/** The cached flag `status()` reports, refreshed only on a tick. */
	lockOwner?: boolean;
	/** What `ownsLock()` reads from disk now; defaults to the cached flag. */
	ownsLock?: boolean;
	settings?: EngineSettings;
	history?: HistoryEntry[];
	/** Make the engine's own validation reject the patch (SettingsOutcome). */
	invalidSettings?: boolean;
	switchFailure?: { code: string; reason: string };
}

/**
 * Mirrors `AccountEngine`'s U7 surface closely enough that the router's
 * mapping is what is under test: outcomes in, tRPC errors out.
 */
function fakeEngine(options: FakeOptions = {}) {
	const platformSupported = options.platformSupported ?? true;
	const lockOwner = options.lockOwner ?? true;
	const ownsLock = options.ownsLock ?? lockOwner;
	let settings: EngineSettings = options.settings ?? defaultEngineSettings();
	let rotation: RotationState = {};
	const history: HistoryEntry[] = [...(options.history ?? [])];
	const cooldownUntil: Record<AccountAgent, number | null> = {
		claude: null,
		codex: null,
	};

	const switchManually = mock(
		async (agent: AccountAgent, selection: string | null) => {
			if (options.switchFailure) {
				return { ok: false as const, ...options.switchFailure };
			}
			// AE8: a manual switch records manual history and restarts the
			// cooldown; it never turns auto-switch off.
			history.unshift({
				at: NOW,
				agent,
				fromAccountId: "uuid-a",
				fromLabel: "A",
				toAccountId: selection ?? "uuid-default",
				toLabel: selection ?? "System default",
				reasonKind: "manual",
			});
			cooldownUntil[agent] = NOW + settings[agent].cooldownSeconds * 1000;
			return { ok: true as const };
		},
	);

	const engine = {
		getSettings: () => settings,
		setSettings: (agent: AccountAgent, patch: Partial<AutoSwitchSettings>) => {
			if (patch.enabled === true && !platformSupported) {
				return {
					ok: false as const,
					code: "unsupported-platform" as const,
					reason: "Windows is not supported.",
				};
			}
			if (options.invalidSettings) {
				return {
					ok: false as const,
					code: "invalid" as const,
					reason: "thresholdPercent must be 1 to 100",
				};
			}
			settings = { ...settings, [agent]: { ...settings[agent], ...patch } };
			return { ok: true as const, settings };
		},
		setRotation: (accountKey: string, inRotation: boolean) => {
			rotation = { ...rotation, [accountKey]: inRotation };
			return { ok: true as const, rotation };
		},
		history: (limit = 50) => history.slice(0, limit),
		status: () => {
			const of = (agent: AccountAgent) => ({
				enabled: settings[agent].enabled,
				activeAccountId: null,
				activeSelection: null,
				cooldownUntil: cooldownUntil[agent],
				exhausted: false,
				lockOwner,
				platformSupported,
			});
			return { claude: of("claude"), codex: of("codex") };
		},
		ownsLock: () => ownsLock,
		switchManually,
	};

	return {
		engine: engine as unknown as AccountEngine,
		switchManually,
		readSettings: () => settings,
		readHistory: () => history,
		readCooldown: (agent: AccountAgent) => cooldownUntil[agent],
	};
}

function context(engine: AccountEngine | null): HostServiceContext {
	return {
		isAuthenticated: true,
		db: {} as unknown,
		runtime: {
			accountEngine: engine
				? createLocalAccountService(engine, new QuotaStore())
				: null,
		},
	} as unknown as HostServiceContext;
}

async function errorOf(promise: Promise<unknown>): Promise<TRPCError> {
	try {
		await promise;
	} catch (error) {
		return error as TRPCError;
	}
	throw new Error("expected the procedure to reject");
}

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
	return {
		at: NOW,
		agent: "claude",
		fromAccountId: "uuid-a",
		fromLabel: "A",
		toAccountId: "uuid-b",
		toLabel: "B",
		reasonKind: "threshold",
		...overrides,
	};
}

describe("usage.engine.setSettings", () => {
	it("rejects a threshold of 0, of 101, and an unknown strategy", async () => {
		const caller = usageRouter.createCaller(context(fakeEngine().engine));

		for (const patch of [
			{ thresholdPercent: 0 },
			{ thresholdPercent: 101 },
			{ strategy: "cheapest" },
		]) {
			const error = await errorOf(
				caller.engine.setSettings({
					agent: "claude",
					patch: patch as never,
				}),
			);
			expect(error.code).toBe("BAD_REQUEST");
		}
	});

	it("round-trips valid values and reports the engine state", async () => {
		const fake = fakeEngine();
		const result = await usageRouter
			.createCaller(context(fake.engine))
			.engine.setSettings({
				agent: "claude",
				patch: {
					enabled: true,
					thresholdPercent: 85,
					strategy: "consume-first",
					modelWindows: ["Fable"],
					pollIntervalSeconds: 30,
					cooldownSeconds: 600,
				},
			});

		expect(result.settings.claude).toEqual({
			enabled: true,
			thresholdPercent: 85,
			strategy: "consume-first",
			modelWindows: ["Fable"],
			pollIntervalSeconds: 30,
			cooldownSeconds: 600,
		});
		expect(result.engineAvailable).toBe(true);
		expect(result.platformSupported).toBe(true);
		expect(result.lockOwner).toBe(true);
		expect(result.status.claude.enabled).toBe(true);
		expect(fake.readSettings().codex.enabled).toBe(false);
	});

	it("refuses `enabled: true` on win32 with the platform code (KTD13)", async () => {
		const fake = fakeEngine({ platformSupported: false, lockOwner: false });
		const error = await errorOf(
			usageRouter
				.createCaller(context(fake.engine))
				.engine.setSettings({ agent: "claude", patch: { enabled: true } }),
		);

		expect(error.code).toBe("PRECONDITION_FAILED");
		expect(error.message).toBe("unsupported-platform");
	});

	it("maps the engine's own `invalid` outcome to invalid-settings", async () => {
		const fake = fakeEngine({ invalidSettings: true });
		const error = await errorOf(
			usageRouter.createCaller(context(fake.engine)).engine.setSettings({
				agent: "codex",
				patch: { thresholdPercent: 50 },
			}),
		);

		expect(error.code).toBe("PRECONDITION_FAILED");
		expect(error.message).toBe("invalid-settings");
	});
});

describe("usage.engine.setRotation and history", () => {
	it("toggles rotation and returns the whole map", async () => {
		const result = await usageRouter
			.createCaller(context(fakeEngine().engine))
			.engine.setRotation({ accountKey: "claude:uuid-b", inRotation: false });

		expect(result).toEqual({ rotation: { "claude:uuid-b": false } });
	});

	it("returns the newest entries first with the reason intact", async () => {
		const fake = fakeEngine({
			history: [
				entry({ at: NOW, reasonKind: "threshold", usedPercent: 91 }),
				entry({ at: NOW - 1000, reasonKind: "manual" }),
				entry({ at: NOW - 2000, reasonKind: "fallback-rejected" }),
			],
		});

		const result = await usageRouter
			.createCaller(context(fake.engine))
			.engine.history({ limit: 20 });

		expect(result.entries.map((row) => row.at)).toEqual([
			NOW,
			NOW - 1000,
			NOW - 2000,
		]);
		expect(result.entries[0]?.reasonKind).toBe("threshold");
		expect(result.entries[0]?.usedPercent).toBe(91);
		expect(result.entries[2]?.reasonKind).toBe("fallback-rejected");
	});

	it("rejects a limit outside 1 to 200", async () => {
		const caller = usageRouter.createCaller(context(fakeEngine().engine));
		expect((await errorOf(caller.engine.history({ limit: 0 }))).code).toBe(
			"BAD_REQUEST",
		);
		expect((await errorOf(caller.engine.history({ limit: 201 }))).code).toBe(
			"BAD_REQUEST",
		);
	});
});

/** AE8 (R4): a manual switch is a nudge, not a pin. */
describe("usage.setDefaultAccount", () => {
	it("delegates to switchManually, records manual history, resets the cooldown and leaves auto-switch on", async () => {
		const enabled = defaultEngineSettings();
		enabled.claude.enabled = true;
		const fake = fakeEngine({ settings: enabled });

		const result = await usageRouter
			.createCaller(context(fake.engine))
			.setDefaultAccount({ agent: "claude", selection: null });

		expect(result).toEqual({ success: true });
		expect(fake.switchManually).toHaveBeenCalledWith("claude", null);
		expect(fake.readHistory()[0]?.reasonKind).toBe("manual");
		expect(fake.readCooldown("claude")).toBe(NOW + 300_000);
		expect(fake.readSettings().claude.enabled).toBe(true);
	});

	it("surfaces a failed switch as the engine's own failure code", async () => {
		const fake = fakeEngine({
			switchFailure: {
				code: "no-target-login",
				reason: "That account is signed out.",
			},
		});
		const error = await errorOf(
			usageRouter
				.createCaller(context(fake.engine))
				.setDefaultAccount({ agent: "codex", selection: "/tmp/codex-home" }),
		);

		expect(error.code).toBe("PRECONDITION_FAILED");
		expect(error.message).toBe("no-target-login");
	});
});

/** KTD5: a loser reads, and never writes. */
describe("a lock loser", () => {
	it("rejects mutations with lock-loser but still serves reads", async () => {
		const enabled = defaultEngineSettings();
		enabled.codex.enabled = true;
		const fake = fakeEngine({
			lockOwner: false,
			settings: enabled,
			history: [entry({ reasonKind: "strategy" })],
		});
		const caller = usageRouter.createCaller(context(fake.engine));

		for (const call of [
			caller.engine.setSettings({ agent: "claude", patch: { enabled: true } }),
			caller.engine.setRotation({ accountKey: "claude:x", inRotation: true }),
			caller.setDefaultAccount({ agent: "claude", selection: null }),
		]) {
			const error = await errorOf(call);
			expect(error.code).toBe("PRECONDITION_FAILED");
			expect(error.message).toBe("lock-loser");
		}
		expect(fake.switchManually).not.toHaveBeenCalled();

		const view = await caller.engine.getSettings();
		expect(view.engineAvailable).toBe(true);
		expect(view.lockOwner).toBe(false);
		expect(view.status.codex.lockOwner).toBe(false);
		expect(view.settings.codex.enabled).toBe(true);
		const history = await caller.engine.history();
		expect(history.entries).toHaveLength(1);
	});
});

/**
 * An engine whose state dir is unsafe claims no lock, so it answers false to
 * the same `ownsLock()` a genuine loser does — with nobody holding anything.
 * These two writes do land in that dir, so they still refuse; what changes is
 * that the user is told which of the two hosts they are on.
 */
describe("an unusable engine state dir", () => {
	it("refuses state writes with engine-state-unusable, not lock-loser", async () => {
		chmodSync(stateDir(), 0o777);
		const fake = fakeEngine({ ownsLock: false });
		const caller = usageRouter.createCaller(context(fake.engine));

		for (const call of [
			caller.engine.setSettings({ agent: "claude", patch: { enabled: true } }),
			caller.engine.setRotation({ accountKey: "claude:x", inRotation: true }),
		]) {
			const error = await errorOf(call);
			expect(error.code).toBe("PRECONDITION_FAILED");
			expect(error.message).toBe("engine-state-unusable");
		}
	});
});

/** KTD5: the lock moves between ticks, so a write gates on disk, not cache. */
describe("a stale cached lockOwner", () => {
	it("allows mutations once the lock is free on disk again", async () => {
		const fake = fakeEngine({ lockOwner: false, ownsLock: true });
		const caller = usageRouter.createCaller(context(fake.engine));

		const view = await caller.engine.setSettings({
			agent: "claude",
			patch: { thresholdPercent: 85 },
		});
		expect(view.settings.claude.thresholdPercent).toBe(85);

		const rotation = await caller.engine.setRotation({
			accountKey: "claude:uuid-b",
			inRotation: false,
		});
		expect(rotation).toEqual({ rotation: { "claude:uuid-b": false } });

		await caller.setDefaultAccount({ agent: "claude", selection: null });
		expect(fake.switchManually).toHaveBeenCalledWith("claude", null);
	});

	it("still refuses once the lock is lost on disk, cache notwithstanding", async () => {
		const fake = fakeEngine({ lockOwner: true, ownsLock: false });
		const caller = usageRouter.createCaller(context(fake.engine));

		for (const call of [
			caller.engine.setSettings({ agent: "claude", patch: { enabled: true } }),
			caller.engine.setRotation({ accountKey: "claude:x", inRotation: true }),
			caller.setDefaultAccount({ agent: "claude", selection: null }),
		]) {
			const error = await errorOf(call);
			expect(error.code).toBe("PRECONDITION_FAILED");
			expect(error.message).toBe("lock-loser");
		}
		expect(fake.switchManually).not.toHaveBeenCalled();
	});
});

/** A cloud sandbox has no engine at all (KTD1). */
describe("a sandbox host", () => {
	let previousRunMode: string | undefined;

	beforeEach(() => {
		previousRunMode = process.env.SUPERSET_HOST_RUN_MODE;
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
	});

	afterEach(() => {
		if (previousRunMode === undefined)
			delete process.env.SUPERSET_HOST_RUN_MODE;
		else process.env.SUPERSET_HOST_RUN_MODE = previousRunMode;
	});

	// `setDefaultAccount` is a plain protected procedure, so it is the one
	// mutation that reaches the resolver and refuses for the missing engine.
	it("rejects setDefaultAccount with engine-unavailable", async () => {
		const caller = usageRouter.createCaller(context(null));

		const error = await errorOf(
			caller.setDefaultAccount({ agent: "claude", selection: null }),
		);

		expect(error.code).toBe("PRECONDITION_FAILED");
		expect(error.message).toBe("engine-unavailable");
	});

	// The two engine writes are machine-only, so the sandbox check refuses
	// them before the resolver runs — never reaching `engine-unavailable`.
	it("refuses the machine-only engine writes as a cloud workspace", async () => {
		const caller = usageRouter.createCaller(context(null));

		const calls: [string, Promise<unknown>][] = [
			[
				"engine.setSettings",
				caller.engine.setSettings({
					agent: "claude",
					patch: { enabled: true },
				}),
			],
			[
				"engine.setRotation",
				caller.engine.setRotation({ accountKey: "claude:x", inRotation: true }),
			],
		];

		for (const [path, call] of calls) {
			const error = await errorOf(call);
			expect(error.code).toBe("PRECONDITION_FAILED");
			expect(error.message).toBe(
				`${path} is not available in a cloud workspace: its sandbox holds exactly one project and one workspace.`,
			);
		}
	});

	it("reports engineAvailable false with defaults and an all-disabled status", async () => {
		const caller = usageRouter.createCaller(context(null));
		const view = await caller.engine.getSettings();

		expect(view.engineAvailable).toBe(false);
		expect(view.settings).toEqual(defaultEngineSettings());
		expect(view.lockOwner).toBe(false);
		expect(view.platformSupported).toBe(process.platform !== "win32");
		for (const agent of ["claude", "codex"] as const) {
			expect(view.status[agent]).toEqual({
				enabled: false,
				activeAccountId: null,
				activeSelection: null,
				cooldownUntil: null,
				exhausted: false,
				lockOwner: false,
				platformSupported: process.platform !== "win32",
			});
		}
		expect((await caller.engine.history()).entries).toEqual([]);
	});
});
