export type McpServerAgent = "claude" | "codex";

export type McpServerScope = "user" | "project" | "local";

/**
 * - `available`: configured for the asking agent and enabled.
 * - `disabled`: configured for the asking agent but turned off in its config.
 * - `other-agent`: configured only for a different agent.
 * - `untrusted`: in a project config the agent skips until the project is
 *   trusted (Codex).
 * - `not-configured`: a Superset plugin server that is not in the asking
 *   agent's config yet (plugin not installed, or not written there yet).
 */
export type McpServerState =
	| "available"
	| "disabled"
	| "other-agent"
	| "untrusted"
	| "not-configured";

export interface McpServerPlugin {
	name: string;
	installed: boolean;
	/** Points at Superset's plugin proxy, so it works only with a connected account. */
	proxied: boolean;
}

export interface McpServerEntry {
	name: string;
	agent: McpServerAgent;
	scope: McpServerScope;
	transport: string;
	enabled: boolean;
	configPath: string;
	plugin: McpServerPlugin | null;
	state: McpServerState;
}
