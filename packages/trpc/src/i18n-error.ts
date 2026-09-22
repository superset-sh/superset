import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";

// User-facing tRPC errors carry a machine-readable key so clients can render
// them in the user's language. The English `message` stays populated as the
// fallback and for logs; `cause` is not serialized by tRPC, so the
// errorFormatter in trpc.ts copies these fields into `shape.data`. Catalog
// entries for every key live in packages/i18n/src/server-errors.ts.
// Strategy: plans/20260826-i18n-strategy.md.

/** The paid tiers a gate can name. Mirrors PlanTier minus "free". */
export type RequiredPlan = "pro" | "enterprise";

export interface I18nErrorCause {
	i18nKey: string;
	i18nParams?: Record<string, string | number>;
	/**
	 * Why a dispatch failed, when the error came from one. Carried beside the
	 * message so a client picks its guidance from a token rather than by
	 * matching the English — which is what it used to do.
	 */
	automationErrorCode?: string;
	/**
	 * Set when the error is a plan gate: the tier the caller's org needs.
	 * Travels to clients as `data.requiredPlan`, so the CLI can print an
	 * upgrade hint and the desktop can open the paywall without matching on
	 * message text.
	 */
	requiredPlan?: RequiredPlan;
}

function isRequiredPlan(value: unknown): value is RequiredPlan | undefined {
	return value === undefined || value === "pro" || value === "enterprise";
}

function isValidParams(
	params: unknown,
): params is Record<string, string | number> | undefined {
	if (params === undefined) return true;
	if (typeof params !== "object" || params === null || Array.isArray(params)) {
		return false;
	}
	return Object.values(params).every(
		(value) => typeof value === "string" || typeof value === "number",
	);
}

/**
 * The dispatch code on a cause, whether or not that cause also carries i18n
 * fields — a failure reported with the host's own wording has no key to
 * translate, but still has a reason worth naming.
 */
export function readAutomationErrorCode(cause: unknown): string | null {
	const code = (cause as { automationErrorCode?: unknown } | null | undefined)
		?.automationErrorCode;
	return typeof code === "string" ? code : null;
}

export function isI18nErrorCause(cause: unknown): cause is I18nErrorCause {
	return (
		typeof cause === "object" &&
		cause !== null &&
		typeof (cause as { i18nKey?: unknown }).i18nKey === "string" &&
		isValidParams((cause as { i18nParams?: unknown }).i18nParams) &&
		isRequiredPlan((cause as { requiredPlan?: unknown }).requiredPlan)
	);
}

// The router's errorFormatter. Lives here (not trpc.ts) so tests can import
// it without pulling trpc.ts's module graph, which opens a DB connection at
// import time. TRPCError.cause is never serialized to clients, so user-facing
// i18n fields must be copied into shape.data here or errorMessage() on the
// client silently falls back to English.
export function formatError<TShape extends { data: object }>({
	shape,
	error,
}: {
	shape: TShape;
	error: { cause?: unknown };
}) {
	const i18nCause = isI18nErrorCause(error.cause) ? error.cause : null;
	return {
		...shape,
		data: {
			...shape.data,
			zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
			i18nKey: i18nCause?.i18nKey ?? null,
			i18nParams: i18nCause?.i18nParams ?? null,
			automationErrorCode: readAutomationErrorCode(error.cause),
			requiredPlan: i18nCause?.requiredPlan ?? null,
		},
	};
}

export function userError(opts: {
	code: TRPCError["code"];
	message: string;
	i18nKey: string;
	params?: Record<string, string | number>;
	automationErrorCode?: string;
	requiredPlan?: RequiredPlan;
}): TRPCError {
	return new TRPCError({
		code: opts.code,
		message: opts.message,
		cause: {
			i18nKey: opts.i18nKey,
			i18nParams: opts.params,
			...(opts.automationErrorCode
				? { automationErrorCode: opts.automationErrorCode }
				: {}),
			requiredPlan: opts.requiredPlan,
		} satisfies I18nErrorCause,
	});
}

/**
 * The one way to refuse a request on plan. Every gate throws through here so
 * the refusal is FORBIDDEN, names the tier in the message, and carries
 * `requiredPlan` for clients to act on.
 */
export function planRequiredError(opts: {
	message: string;
	i18nKey: string;
	requiredPlan: RequiredPlan;
}): TRPCError {
	return userError({ code: "FORBIDDEN", ...opts });
}
