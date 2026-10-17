import type { PromptTransport } from "@superset/shared/agent-prompt-launch";

/**
 * A configured terminal-agent row on a host — one entry in Settings → Agents.
 * Mirrors the output of `settings.agentConfigs.*` on the host tRPC router.
 */
export interface HostAgentConfig {
	id: string;
	presetId: string;
	iconId: string | null;
	label: string;
	command: string;
	args: string[];
	promptTransport: PromptTransport;
	promptArgs: string[];
	resumeArgs: string[];
	forkArgs: string[];
	env: Record<string, string>;
	order: number;
}
