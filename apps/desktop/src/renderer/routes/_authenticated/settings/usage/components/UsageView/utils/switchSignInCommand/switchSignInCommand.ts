import { quoteShellToken } from "renderer/lib/argv";

interface SwitchSignInLogin {
	agent: "claude" | "codex";
	/** Config dir the login lives in; null for the system-default login. */
	selection: string | null;
}

/**
 * The terminal command that re-authenticates an existing login in place: the
 * system default runs the CLI bare, a profile runs it against its own dir.
 * The dir is the absolute path, quoted — Claude Code keys its Keychain item
 * on the literal CLAUDE_CONFIG_DIR string, and agent launches inject the
 * absolute path, so any other spelling re-auths a different identity.
 * Quoted as a POSIX shell literal (not a bare double-quoted string) since
 * the path is copied straight into a terminal — a selection containing
 * `$()`, backticks, or `"` must not be interpreted as shell syntax.
 */
export function switchSignInCommand(login: SwitchSignInLogin): string {
	if (login.agent === "claude") {
		return login.selection === null
			? "claude auth login"
			: `CLAUDE_CONFIG_DIR=${quoteShellToken(login.selection)} claude auth login`;
	}
	return login.selection === null
		? "codex login"
		: `CODEX_HOME=${quoteShellToken(login.selection)} codex login`;
}
