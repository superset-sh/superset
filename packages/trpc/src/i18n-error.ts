import { TRPCError } from "@trpc/server";

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

export function isI18nErrorCause(cause: unknown): cause is I18nErrorCause {
	return (
		typeof cause === "object" &&
		cause !== null &&
		typeof (cause as { i18nKey?: unknown }).i18nKey === "string"
	);
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
