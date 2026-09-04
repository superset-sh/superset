import {
	type AccountCredentialKind,
	apiBillingLoginCommand,
} from "../apiBilling";
import type { ManagedAgent } from "../visibleQuotaAgents";

/**
 * The terminal command that signs a new profile dir into the agent. $HOME
 * stays unexpanded on purpose — the user's shell resolves it, so the same
 * command works over SSH to a remote host.
 */
export function addAccountCommand(
	agent: ManagedAgent,
	slug: string,
	credentialKind: AccountCredentialKind,
): string {
	const dir =
		agent === "claude" ? `"$HOME/.claude-${slug}"` : `"$HOME/.codex-${slug}"`;
	if (credentialKind === "api_key") {
		return `mkdir -p ${dir} && ${apiBillingLoginCommand(agent, dir)}`;
	}
	if (agent === "claude") {
		return `CLAUDE_CONFIG_DIR=${dir} claude auth login`;
	}
	return `mkdir -p ${dir} && CODEX_HOME=${dir} codex login`;
}
