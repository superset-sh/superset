import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { AccountEngineStatePayload } from "@superset/workspace-client";

type SwitchFailureCode = NonNullable<
	AccountEngineStatePayload["lastSwitchFailure"]
>["code"];

/**
 * The sentence for every code the engine can refuse a switch with. The host
 * sends a closed-set code and never a message (KTD6), so the wording lives
 * here and gets translated.
 *
 * Exhaustive on purpose: a `Record` over the whole union means a code added to
 * `AccountSwitchFailureCode` fails the typecheck here instead of silently
 * reaching the user as a bare code. Each line says what happened and whether
 * the login the user has is still the one in place, because that is the only
 * thing they can act on.
 */
const SWITCH_FAILURE_MESSAGES: Record<SwitchFailureCode, MessageDescriptor> = {
	"owner-unknown": msg({
		message:
			"Superset could not tell which account is signed in, so it left the current one in place.",
	}),
	"invalid-target": msg({
		message:
			"The account it tried to switch to is not usable, so the previous account is still active.",
	}),
	"invalid-owner": msg({
		message:
			"The signed-in account could not be identified, so nothing was changed.",
	}),
	"invalid-active-dir": msg({
		message:
			"The agent's account folder is not in a usable state, so the previous account is still active.",
	}),
	"no-target-login": msg({
		message:
			"The account it tried to switch to has no saved login. Sign in to it once and switching can use it.",
	}),
	"no-target-identity": msg({
		message:
			"The account it tried to switch to has no saved identity, so the previous account is still active.",
	}),
	"source-changed": msg({
		message:
			"The signed-in account changed while switching, so the switch was abandoned.",
	}),
	"target-changed": msg({
		message:
			"The account it was switching to changed while switching, so the switch was abandoned.",
	}),
	"keychain-ambiguous": msg({
		message:
			"More than one saved login matched that account, so Superset would not guess which to use.",
	}),
	"write-failed": msg({
		message:
			"The new login could not be saved, so the previous account is still active.",
	}),
	"split-state": msg({
		message:
			"The switch stopped halfway. Open Usage to check which account is signed in.",
	}),
	"verify-failed": msg({
		message:
			"The new login could not be verified, so the previous account was put back.",
	}),
	"active-dir-unavailable": msg({
		message:
			"The agent's account folder could not be reached, so the previous account is still active.",
	}),
	"pointer-failed": msg({
		message:
			"The active account could not be updated, so the previous account is still active.",
	}),
	"unsupported-platform": msg({
		message:
			"Automatic account switching is not available on Windows. Switch accounts by hand instead.",
	}),
	"unknown-account": msg({
		message:
			"That account is not one this host can see, so the previous account is still active.",
	}),
};

/** A host one release ahead or behind can send a code this build has no
 * wording for. The user still gets a sentence rather than the code. */
const UNKNOWN_FAILURE_MESSAGE = msg({
	message:
		"The switch did not go through. The previous account is still active.",
});

/** The translated line for one switch-failure code. Never renders the code. */
export function switchFailureMessage(code: SwitchFailureCode): string {
	return i18n._(SWITCH_FAILURE_MESSAGES[code] ?? UNKNOWN_FAILURE_MESSAGE);
}
