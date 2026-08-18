interface SignInTarget {
	provider: "claude" | "codex";
	/** Config dir to inject as an env override; null for the system default. */
	selection: string | null;
	sourceLabel: string;
}

/**
 * The terminal command that re-authenticates this login, including the env
 * override that targets a non-default profile dir. `sourceLabel` is the
 * ~-relative spelling of `selection` whenever a profile dir is set (see
 * host-service usage discovery), so prefer it over the absolute path.
 */
export function signInCommand(account: SignInTarget): string {
	const configDir =
		account.selection === null
			? null
			: account.sourceLabel.startsWith("~") ||
					account.sourceLabel.startsWith("/")
				? account.sourceLabel
				: account.selection;
	if (account.provider === "codex") {
		// Codex refreshes its own token on launch; no /login step needed.
		return configDir === null ? "codex" : `CODEX_HOME=${configDir} codex`;
	}
	return configDir === null
		? "claude /login"
		: `CLAUDE_CONFIG_DIR=${configDir} claude /login`;
}
