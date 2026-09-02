import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";

export interface CloneError {
	message: string;
	needsGhAuth: boolean;
}

/** `gh auth login` invocation shared by every gh sign-in surface. Short
 * flags (-h/--hostname, -p/--git-protocol, -w/--web) keep it inside narrow
 * command boxes without scrolling. */
export const GH_AUTH_COMMAND = "gh auth login -h github.com -p https -w";

export const GH_INSTALL_COMMAND = `brew install gh && ${GH_AUTH_COMMAND}`;

const GH_AUTH_FAILURE_PATTERNS = [
	"Repository not found",
	"Authentication failed",
	"could not read Username",
	"terminal prompts disabled",
];

/**
 * Turns raw git clone stderr into a user-actionable message, flagging the
 * failures that GitHub CLI sign-in fixes.
 *
 * Classification matches on `rawErrorMessage`: `errorMessage` output may be
 * translated, and matching localized text would silently stop classifying.
 */
export function classifyCloneError(err: unknown): CloneError {
	const raw = rawErrorMessage(err);
	if (raw.includes("Permission denied (publickey)")) {
		return {
			message:
				"SSH authentication failed. Sign in to GitHub CLI and use the HTTPS URL instead.",
			needsGhAuth: true,
		};
	}
	if (GH_AUTH_FAILURE_PATTERNS.some((pattern) => raw.includes(pattern))) {
		return {
			message:
				"Couldn't access this repository. If it's private, sign in to GitHub CLI first.",
			needsGhAuth: true,
		};
	}
	// errorMessage() surfaces a bare thrown string as the message; a clone that
	// rejected with something that isn't an Error has nothing worth showing, so
	// keep the generic line the tests pin.
	return {
		message:
			err instanceof Error
				? errorMessage(err, "Failed to clone repository")
				: "Failed to clone repository",
		needsGhAuth: false,
	};
}
