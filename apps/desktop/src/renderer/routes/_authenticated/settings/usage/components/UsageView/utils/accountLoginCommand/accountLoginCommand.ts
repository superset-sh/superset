export type AccountCredentialKind = "subscription" | "api_key";
type Provider = "claude" | "codex";

const API_BILLING_MARKER = ".superset-api-billing";

/**
 * Builds a pasteable provider-owned login command. API secrets are entered in
 * the provider/browser flow (Claude) or hidden terminal input (Codex); they
 * never cross Superset's renderer or host-service APIs.
 */
export function accountLoginCommand(
	provider: Provider,
	slug: string,
	credentialKind: AccountCredentialKind,
): string {
	if (provider === "claude") {
		const configDir = `$HOME/.claude-${slug}`;
		if (credentialKind === "api_key") {
			return `mkdir -p "${configDir}" && CLAUDE_CONFIG_DIR="${configDir}" claude auth login --console && touch "${configDir}/${API_BILLING_MARKER}"`;
		}
		return `CLAUDE_CONFIG_DIR="${configDir}" claude auth login`;
	}

	const codexHome = `$HOME/.codex-${slug}`;
	if (credentialKind === "api_key") {
		return `mkdir -p "${codexHome}" && (printf 'OpenAI API key: '; stty -echo; trap 'stty echo' EXIT HUP INT TERM; IFS= read -r SUPERSET_OPENAI_API_KEY; stty echo; trap - EXIT HUP INT TERM; printf '\\n'; printf '%s' "$SUPERSET_OPENAI_API_KEY" | CODEX_HOME="${codexHome}" codex login --with-api-key) && touch "${codexHome}/${API_BILLING_MARKER}"`;
	}
	return `mkdir -p "${codexHome}" && CODEX_HOME="${codexHome}" codex login`;
}
