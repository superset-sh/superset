import { describe, expect, it, mock } from "bun:test";
import type { TRPCError } from "@trpc/server";
import type { AccountEngine } from "../../../account-engine/account-engine.ts";
import { defaultEngineSettings } from "../../../account-engine/engine-state.ts";
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

interface FakeOptions {
	platformSupported?: boolean;
	lockOwner?: boolean;
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
		runtime: { accountEngine: engine },
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

/** A cloud sandbox has no engine at all (KTD1). */
describe("a sandbox host", () => {
	it("rejects mutations with engine-unavailable", async () => {
		const caller = usageRouter.createCaller(context(null));

		for (const call of [
			caller.engine.setSettings({ agent: "claude", patch: { enabled: true } }),
			caller.engine.setRotation({ accountKey: "claude:x", inRotation: true }),
			caller.setDefaultAccount({ agent: "claude", selection: null }),
		]) {
			const error = await errorOf(call);
			expect(error.code).toBe("PRECONDITION_FAILED");
			expect(error.message).toBe("engine-unavailable");
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
