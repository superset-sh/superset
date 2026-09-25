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

export function isAgentCredentialEnvName(
	name: string,
): name is AgentCredentialEnvName {
	return (AGENT_CREDENTIAL_ENV_NAMES as readonly string[]).includes(name);
}

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

/**
 * A credential placeholder meant for the agent's own process rather than the
 * whole box travels under this prefix, so an environment variable of the
 * same name (the app's real key) keeps the plain name.
 */
export const AGENT_ENV_OVERLAY_PREFIX = "SUPERSET_AGENT_ENV_";

export function agentEnvOverlay(
	variables: Record<string, string>,
): Record<string, string> {
	const overlay: Record<string, string> = {};
	for (const [key, value] of Object.entries(variables)) {
		if (key.startsWith(AGENT_ENV_OVERLAY_PREFIX)) {
			overlay[key.slice(AGENT_ENV_OVERLAY_PREFIX.length)] = value;
		}
	}
	return overlay;
}
