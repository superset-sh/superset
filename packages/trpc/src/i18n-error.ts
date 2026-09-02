import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";

// User-facing tRPC errors carry a machine-readable key so clients can render
// them in the user's language. The English `message` stays populated as the
// fallback and for logs; `cause` is not serialized by tRPC, so the
// errorFormatter in trpc.ts copies these fields into `shape.data`. Catalog
// entries for every key live in packages/i18n/src/server-errors.ts.
// Strategy: plans/20260826-i18n-strategy.md.

export interface I18nErrorCause {
	i18nKey: string;
	i18nParams?: Record<string, string | number>;
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

export function isI18nErrorCause(cause: unknown): cause is I18nErrorCause {
	return (
		typeof cause === "object" &&
		cause !== null &&
		typeof (cause as { i18nKey?: unknown }).i18nKey === "string" &&
		isValidParams((cause as { i18nParams?: unknown }).i18nParams)
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
		},
	};
}

export function userError(opts: {
	code: TRPCError["code"];
	message: string;
	i18nKey: string;
	params?: Record<string, string | number>;
}): TRPCError {
	return new TRPCError({
		code: opts.code,
		message: opts.message,
		cause: {
			i18nKey: opts.i18nKey,
			i18nParams: opts.params,
		} satisfies I18nErrorCause,
	});
}
