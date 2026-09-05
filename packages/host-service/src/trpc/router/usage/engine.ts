import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type {
	AccountEngine,
	AgentEngineStatus,
} from "../../../account-engine/account-engine.ts";
import { defaultEngineSettings } from "../../../account-engine/engine-state.ts";
import type {
	AccountAgent,
	EngineSettings,
	HistoryEntry,
	RotationState,
} from "../../../account-engine/types.ts";
import { machineOnlyProcedure, queryProcedure, router } from "../../index";

/**
 * Every refusal the account-engine procedures raise, as the literal message
 * of a `PRECONDITION_FAILED` error. The desktop matches on these, so they are
 * codes rather than sentences: the UI owns the wording (and its translation).
 * Range violations are caught by the input schemas below and surface as the
 * usual `BAD_REQUEST` instead.
 */
export const ENGINE_ERROR_CODES = [
	"unsupported-platform",
	"lock-loser",
	"engine-unavailable",
	"invalid-settings",
] as const;

export type UsageEngineErrorCode = (typeof ENGINE_ERROR_CODES)[number];

export function engineError(code: UsageEngineErrorCode | string): TRPCError {
	return new TRPCError({ code: "PRECONDITION_FAILED", message: code });
}

/** What every settings call answers with: the state the panel renders from. */
export interface UsageEngineView {
	engineAvailable: boolean;
	platformSupported: boolean;
	settings: EngineSettings;
	status: Record<AccountAgent, AgentEngineStatus>;
	lockOwner: boolean;
}

/** R11 to R15. The engine re-validates; these keep a typo out of state. */
const patchInput = z.object({
	enabled: z.boolean().optional(),
	thresholdPercent: z.number().int().min(1).max(100).optional(),
	strategy: z.enum(["best", "consume-first"]).optional(),
	modelWindows: z.array(z.string().min(1).max(64)).max(8).optional(),
	pollIntervalSeconds: z
		.union([z.literal(30), z.literal(60), z.literal(120), z.literal(300)])
		.optional(),
	cooldownSeconds: z.number().int().min(60).max(3600).optional(),
});

function disabledStatus(platformSupported: boolean): AgentEngineStatus {
	return {
		enabled: false,
		activeAccountId: null,
		activeSelection: null,
		cooldownUntil: null,
		exhausted: false,
		lockOwner: false,
		platformSupported,
	};
}

/**
 * Reads never fail: a sandbox (no engine, KTD1) and a lock loser (KTD5) both
 * answer, so the Usage page can explain itself instead of showing an error.
 */
export function engineView(
	engine: AccountEngine | null,
	settings?: EngineSettings,
): UsageEngineView {
	if (!engine) {
		const platformSupported = process.platform !== "win32";
		return {
			engineAvailable: false,
			platformSupported,
			settings: defaultEngineSettings(),
			status: {
				claude: disabledStatus(platformSupported),
				codex: disabledStatus(platformSupported),
			},
			lockOwner: false,
		};
	}
	const status = engine.status();
	return {
		engineAvailable: true,
		platformSupported: status.claude.platformSupported,
		settings: settings ?? engine.getSettings(),
		status,
		lockOwner: status.claude.lockOwner,
	};
}

/**
 * A mutation needs a live engine that owns the host-wide lock. On `win32` the
 * engine never claims that lock (KTD13 stops it before it ticks), so the
 * platform refusal — which the engine itself raises, per call — must not be
 * masked here by a lock-loser error.
 */
export function writableEngine(engine: AccountEngine | null): AccountEngine {
	if (!engine) throw engineError("engine-unavailable");
	const status = engine.status().claude;
	if (status.platformSupported && !status.lockOwner) {
		throw engineError("lock-loser");
	}
	return engine;
}

/**
 * The account engine's settings, rotation flags and switch history (U7).
 * Mounted under `usage.engine`.
 */
export const usageEngineRouter = router({
	/** Per-agent settings plus the runtime state the panel needs. */
	getSettings: queryProcedure.query(
		({ ctx }): UsageEngineView => engineView(ctx.runtime.accountEngine),
	),

	/** R10 to R15. Returns the same shape as `getSettings`. */
	setSettings: machineOnlyProcedure
		.input(z.object({ agent: z.enum(["claude", "codex"]), patch: patchInput }))
		.mutation(({ ctx, input }): UsageEngineView => {
			const engine = writableEngine(ctx.runtime.accountEngine);
			const outcome = engine.setSettings(input.agent, input.patch);
			if (!outcome.ok) {
				throw engineError(
					outcome.code === "invalid" ? "invalid-settings" : outcome.code,
				);
			}
			return engineView(engine, outcome.settings);
		}),

	/** R16: hold an account out of automatic rotation, or put it back. */
	setRotation: machineOnlyProcedure
		.input(
			z.object({
				accountKey: z.string().min(1).max(256),
				inRotation: z.boolean(),
			}),
		)
		.mutation(({ ctx, input }): { rotation: RotationState } => {
			const engine = writableEngine(ctx.runtime.accountEngine);
			const outcome = engine.setRotation(input.accountKey, input.inRotation);
			// The engine re-reads the lock from disk, so it can refuse where
			// `writableEngine`'s cached flag still said yes.
			if (!outcome.ok) throw engineError(outcome.code);
			return { rotation: outcome.rotation };
		}),

	/** R21: the switch history, newest first. */
	history: queryProcedure
		.input(
			z
				.object({ limit: z.number().int().min(1).max(200).optional() })
				.optional(),
		)
		.query(({ ctx, input }): { entries: HistoryEntry[] } => ({
			entries: ctx.runtime.accountEngine?.history(input?.limit ?? 50) ?? [],
		})),
});
