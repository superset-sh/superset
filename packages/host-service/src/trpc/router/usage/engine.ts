import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { AgentEngineStatus } from "../../../account-engine/account-engine.ts";
import type { AccountService } from "../../../account-engine/account-service.ts";
import {
	defaultEngineSettings,
	EngineState,
} from "../../../account-engine/engine-state.ts";
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
	"engine-state-unusable",
	// A removal Superset cannot clear: nothing on this host — runtime record,
	// pointer, nor the active dir's own identity — says which login is live,
	// so it will not delete a dir blind. The UI turns it into an
	// acknowledgement that re-sends the removal with the override.
	"active-account-unknown",
] as const;

export type UsageEngineErrorCode = (typeof ENGINE_ERROR_CODES)[number];

export function engineError(code: UsageEngineErrorCode | string): TRPCError {
	return new TRPCError({ code: "PRECONDITION_FAILED", message: code });
}

/**
 * Whether the engine's state dir is one it refuses to write — not ours, not a
 * directory, or writable by anyone else. The engine answers the same question
 * before every write and degrades instead of throwing, but it keeps its
 * `EngineState` private, so the router asks the dir itself.
 *
 * It matters here because `ownsLock()` is false in this case too, for a reason
 * that is the opposite of a lock loser: no engine sharing this dir can claim
 * the lock, so none of them can switch either. The specific reason is logged
 * once by `assertSafeStateDir`; the UI turns the code into the sentence that
 * names the path and the fix.
 */
export function engineStateUnusable(): boolean {
	return new EngineState().assertSafeStateDir().readOnly;
}

/** What every settings call answers with: the state the panel renders from. */
export interface UsageEngineView {
	engineAvailable: boolean;
	movesRunningSessions: boolean;
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
export async function engineView(
	engine: AccountService | null,
	settings?: EngineSettings,
): Promise<UsageEngineView> {
	// An unsafe state directory prevents the machine owner from starting, so
	// do not ask its unavailable RPC endpoint for status in this known case.
	if (!engine || engineStateUnusable()) {
		const platformSupported = process.platform !== "win32";
		return {
			engineAvailable: false,
			movesRunningSessions: false,
			platformSupported,
			settings: defaultEngineSettings(),
			status: {
				claude: disabledStatus(platformSupported),
				codex: disabledStatus(platformSupported),
			},
			lockOwner: false,
		};
	}
	const status = await engine.status();
	return {
		engineAvailable: true,
		movesRunningSessions:
			status.claude.platformSupported && !engineStateUnusable(),
		platformSupported: status.claude.platformSupported,
		settings: settings ?? (await engine.getSettings()),
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
export async function writableEngine(
	engine: AccountService | null,
): Promise<AccountService> {
	if (!engine) throw engineError("engine-unavailable");
	// The lock can have been released since the last tick, so re-read it
	// from disk the way the engine's own mutations do.
	if (
		(await engine.status()).claude.platformSupported &&
		!(await engine.ownsLock())
	) {
		// Two different hosts answer false here, and telling the user the
		// wrong one sends them looking for a rival instance that does not
		// exist. These writes land in the state dir, so an unusable one is
		// still a refusal — just an honest, actionable one.
		throw engineError(
			engineStateUnusable() ? "engine-state-unusable" : "lock-loser",
		);
	}
	return engine;
}

/**
 * The account engine's settings, rotation flags and switch history (U7).
 * Mounted under `usage.engine`.
 */
export const usageEngineRouter = router({
	/** Per-agent settings plus the runtime state the panel needs. */
	getSettings: queryProcedure.query(({ ctx }) =>
		engineView(ctx.runtime.accountEngine),
	),

	/** R10 to R15. Returns the same shape as `getSettings`. */
	setSettings: machineOnlyProcedure
		.input(z.object({ agent: z.enum(["claude", "codex"]), patch: patchInput }))
		.mutation(async ({ ctx, input }): Promise<UsageEngineView> => {
			const engine = await writableEngine(ctx.runtime.accountEngine);
			const outcome = await engine.setSettings(input.agent, input.patch);
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
		.mutation(async ({ ctx, input }): Promise<{ rotation: RotationState }> => {
			const engine = await writableEngine(ctx.runtime.accountEngine);
			const outcome = await engine.setRotation(
				input.accountKey,
				input.inRotation,
			);
			// The gate and the mutation are two separate disk reads, so the
			// engine can still refuse a lock lost in between.
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
		.query(
			async ({ ctx, input }): Promise<{ entries: HistoryEntry[] }> => ({
				entries:
					(await ctx.runtime.accountEngine?.history(input?.limit ?? 50)) ?? [],
			}),
		),
});
