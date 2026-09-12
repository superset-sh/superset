import { msg } from "@lingui/core/macro";
import { i18n } from "./index";
import { serverErrorMessages } from "./server-errors";

// DISPLAY ONLY: the return value is potentially translated, so it must never
// reach logs, Sentry/PostHog, or string-matching logic — those need stable
// English and use rawErrorMessage() or the error object itself. Renders a
// caught error for the user in the active locale. Replaces the raw
// `toast.error(error.message)` pattern: if the server attached an i18nKey
// (via userError() in @superset/trpc, surfaced through shape.data by its
// errorFormatter), the translated catalog entry wins; otherwise the error's
// own message is shown; a generic translated fallback covers messageless
// errors.
export function errorMessage(error: unknown, fallback?: string): string {
	const data = (error as { data?: unknown } | null | undefined)?.data as
		| { i18nKey?: unknown; i18nParams?: unknown }
		| null
		| undefined;
	if (typeof data?.i18nKey === "string") {
		const render = serverErrorMessages[data.i18nKey];
		if (render) {
			return render(
				(data.i18nParams ?? undefined) as Record<string, unknown> | undefined,
			);
		}
	}
	if (typeof error === "string" && error.length > 0) {
		return error;
	}
	const message = (error as { message?: unknown } | null | undefined)?.message;
	if (typeof message === "string" && message.length > 0) {
		return message;
	}
	return (
		fallback ??
		i18n._(
			msg({
				message: "Something went wrong. Please try again.",
			}),
		)
	);
}

// Untranslated extraction for logs, telemetry, and error classification:
// always the error's own (English) message, never a catalog string. Display
// code uses errorMessage() instead.
export function rawErrorMessage(error: unknown): string {
	if (typeof error === "string") {
		return error;
	}
	const message = (error as { message?: unknown } | null | undefined)?.message;
	return typeof message === "string" ? message : "";
}
