import { quoteShellToken } from "renderer/lib/argv";

interface SwitchSignInLogin {
	provider: "claude" | "codex";
	credentialKind: "subscription" | "api_key";
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
	if (login.provider === "claude") {
		if (login.credentialKind === "api_key") {
			const loginCommand =
				login.selection === null
					? "claude auth login --console"
					: `CLAUDE_CONFIG_DIR=${quoteShellToken(login.selection)} claude auth login --console`;
			return login.selection === null
				? loginCommand
				: `${loginCommand} && touch ${quoteShellToken(`${login.selection}/.superset-api-billing`)}`;
		}
		return login.selection === null
			? "claude auth login"
			: `CLAUDE_CONFIG_DIR=${quoteShellToken(login.selection)} claude auth login`;
	}
	if (login.credentialKind === "api_key") {
		const codexCommand =
			login.selection === null
				? "codex login --with-api-key"
				: `CODEX_HOME=${quoteShellToken(login.selection)} codex login --with-api-key`;
		const loginCommand = `(printf 'OpenAI API key: '; stty -echo; trap 'stty echo' EXIT HUP INT TERM; IFS= read -r SUPERSET_OPENAI_API_KEY; stty echo; trap - EXIT HUP INT TERM; printf '\\n'; printf '%s' "$SUPERSET_OPENAI_API_KEY" | ${codexCommand})`;
		return login.selection === null
			? loginCommand
			: `${loginCommand} && touch ${quoteShellToken(`${login.selection}/.superset-api-billing`)}`;
	}
	return login.selection === null
		? "codex login"
		: `CODEX_HOME=${quoteShellToken(login.selection)} codex login`;
}
