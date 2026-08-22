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
 */
export function classifyCloneError(err: unknown): CloneError {
	const message =
		err instanceof Error ? err.message : "Failed to clone repository";
	if (message.includes("Permission denied (publickey)")) {
		return {
			message:
				"SSH authentication failed. Sign in to GitHub CLI and use the HTTPS URL instead.",
			needsGhAuth: true,
		};
	}
	if (GH_AUTH_FAILURE_PATTERNS.some((pattern) => message.includes(pattern))) {
		return {
			message:
				"Couldn't access this repository. If it's private, sign in to GitHub CLI first.",
			needsGhAuth: true,
		};
	}
	return { message, needsGhAuth: false };
}
