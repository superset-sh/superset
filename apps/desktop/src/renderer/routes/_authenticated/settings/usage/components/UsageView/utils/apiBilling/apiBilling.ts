import type { ManagedAgent } from "../visibleQuotaAgents";

export type AccountCredentialKind = "subscription" | "api_key";

/**
 * Written inside the profile dir once an API-billing login succeeds, holding
 * the agent id. The host classifies the profile by this file alone, so it
 * never has to open the credential file the key landed in, and the agent id
 * keeps a Codex home out of the Claude dot-dir scan (host-service
 * usage/profiles.ts).
 */
export const API_BILLING_MARKER = ".superset-api-billing";

/** Where each provider shows API spend, since no quota endpoint exists. */
export const API_BILLING_LINKS: Record<ManagedAgent, { usage: string }> = {
	claude: { usage: "https://console.anthropic.com/settings/usage" },
	codex: { usage: "https://platform.openai.com/usage" },
};

/**
 * Signs `quotedDir` into API billing and marks it. Claude's Console login is
 * a browser OAuth flow like the subscription one. Codex takes the key on
 * stdin, so the command prompts for it with echo off and pipes it straight
 * in — the key never appears in the command text or shell history. The
 * marker is written only after the login exits 0, so a cancelled login
 * leaves nothing for discovery to pick up. One line on purpose: a multi-line
 * paste would feed the next line to `read` as the key.
 */
export function apiBillingLoginCommand(
	agent: ManagedAgent,
	quotedDir: string,
): string {
	const mark = `printf ${agent} > ${quotedDir}/${API_BILLING_MARKER}`;
	if (agent === "claude") {
		return `CLAUDE_CONFIG_DIR=${quotedDir} claude auth login --console && ${mark}`;
	}
	return `printf 'OpenAI API key: ' && read -rs OPENAI_KEY && echo && printf '%s' "$OPENAI_KEY" | CODEX_HOME=${quotedDir} codex login --with-api-key && ${mark}; unset OPENAI_KEY`;
}
