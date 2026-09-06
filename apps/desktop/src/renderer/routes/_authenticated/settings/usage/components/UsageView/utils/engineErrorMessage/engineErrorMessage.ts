import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { rawErrorMessage } from "@superset/i18n/errors";

/**
 * The account engine refuses with a bare code as the tRPC error message so
 * the wording lives here and gets translated. `rawErrorMessage` on purpose:
 * this is classification, not display.
 */
const ENGINE_CODE_MESSAGES = {
	"unsupported-platform": msg({
		message:
			"Automatic account switching is not available on Windows. Switch accounts by hand instead.",
	}),
	"lock-loser": msg({
		message:
			"Another Superset instance on this machine owns account switching. Change this there.",
	}),
	"engine-unavailable": msg({
		message: "The account engine is not running on this host.",
	}),
	"invalid-settings": msg({
		message: "The host rejected that value, so the previous one still stands.",
	}),
} as const;

/** The bare code the host refused with, for the fallback line. */
export function engineErrorCode(error: unknown): string {
	return rawErrorMessage(error).trim();
}

/**
 * A translated line for one of the engine's refusal codes, or null when the
 * host failed for some other reason — callers then compose their own
 * sentence around {@link engineErrorCode}, so a new host code still tells the
 * user something they can quote.
 */
export function engineErrorMessage(error: unknown): string | null {
	const known =
		ENGINE_CODE_MESSAGES[
			engineErrorCode(error) as keyof typeof ENGINE_CODE_MESSAGES
		];
	return known ? i18n._(known) : null;
}
