/**
 * The environment variables a signed-in agent reads inside a cloud workspace.
 *
 * A subscription is a long-lived token the agent's own CLI accepts directly
 * (`claude setup-token`), so it needs no refreshing on our side. An API key is
 * the provider key, optionally against a compatible endpoint.
 */
export const AGENT_CREDENTIAL_ENV_NAMES = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_BASE_URL",
	"CLAUDE_CODE_OAUTH_TOKEN",
	"OPENAI_API_KEY",
	"OPENAI_BASE_URL",
] as const;

export type AgentCredentialEnvName =
	(typeof AGENT_CREDENTIAL_ENV_NAMES)[number];

export interface AgentCredentialShape {
	agent: string;
	kind: "subscription" | "api_key";
	value: string;
	baseUrl?: string | null;
}

/** The env a credential contributes to the sandbox. Empty when we cannot place it. */
export function agentCredentialToEnv(
	credential: AgentCredentialShape,
): Partial<Record<AgentCredentialEnvName, string>> {
	const { agent, kind, value, baseUrl } = credential;
	if (agent === "claude") {
		if (kind === "subscription") return { CLAUDE_CODE_OAUTH_TOKEN: value };
		return {
			ANTHROPIC_API_KEY: value,
			...(baseUrl ? { ANTHROPIC_BASE_URL: baseUrl } : {}),
		};
	}
	if (agent === "codex" && kind === "api_key") {
		return {
			OPENAI_API_KEY: value,
			...(baseUrl ? { OPENAI_BASE_URL: baseUrl } : {}),
		};
	}
	return {};
}
