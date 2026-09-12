import { quoteShellToken } from "renderer/lib/argv";
import {
	type AccountCredentialKind,
	apiBillingLoginCommand,
} from "../apiBilling";
import type { ManagedAgent } from "../visibleQuotaAgents";

interface SwitchSignInLogin {
	agent: ManagedAgent;
	credentialKind: AccountCredentialKind;
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
 *
 * An API-billed login stays API-billed: re-signing it runs the provider's
 * API login and rewrites the marker, which is also how the dialog notices
 * the re-login (the marker's mtime is the profile's fingerprint).
 */
export function switchSignInCommand(login: SwitchSignInLogin): string {
	if (login.credentialKind === "api_key") {
		// The system-default Codex home is wherever the CLI resolves it; the
		// default Claude dir is never API-billed (discovery excludes ~/.claude).
		const dir =
			login.selection !== null
				? quoteShellToken(login.selection)
				: login.agent === "claude"
					? '"$HOME/.claude"'
					: // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, resolved by the user's shell
						'"${CODEX_HOME:-$HOME/.codex}"';
		return apiBillingLoginCommand(login.agent, dir);
	}
	if (login.agent === "claude") {
		return login.selection === null
			? "claude auth login"
			: `CLAUDE_CONFIG_DIR=${quoteShellToken(login.selection)} claude auth login`;
	}
	return login.selection === null
		? "codex login"
		: `CODEX_HOME=${quoteShellToken(login.selection)} codex login`;
}
