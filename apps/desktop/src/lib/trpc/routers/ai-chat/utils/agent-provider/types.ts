/**
 * Agent Provider Interface
 *
 * Abstracts the agent backend so the session manager and UI remain
 * provider-agnostic. Claude SDK is the first implementation; future
 * providers (e.g., OpenAI Codex) implement the same interface.
 */

export interface AgentProviderSpec {
	/** Unique provider ID ("claude-sdk", "openai", etc.) */
	id: string;
	/** Human-readable display name */
	name: string;
}

export interface AgentRegistration {
	id: string;
	endpoint: string;
	triggers: string;
	bodyTemplate: Record<string, unknown>;
}

export interface AgentProvider {
	readonly spec: AgentProviderSpec;

	/** Build the agent registration payload for the proxy */
	getAgentRegistration(opts: {
		sessionId: string;
		cwd: string;
	}): AgentRegistration;

	/** Returns the provider's opaque resume token (e.g., claudeSessionId) */
	getProviderSessionId(sessionId: string): Promise<string | undefined>;

	/** Provider-specific cleanup (e.g., abort in-flight queries) */
	cleanup(sessionId: string): Promise<void>;
}
