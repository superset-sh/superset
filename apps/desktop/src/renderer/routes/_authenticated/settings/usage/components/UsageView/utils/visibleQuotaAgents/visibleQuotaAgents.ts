import type { UsageAccount } from "../../../../hooks/useHostUsageQuota";

export type QuotaAgent = UsageAccount["agent"];

/** Agents whose logins Superset can add, switch, and remove. */
export type ManagedAgent = "claude" | "codex";

const AGENT_ORDER: QuotaAgent[] = ["claude", "codex", "grok", "agy"];

export function isManagedAgent(agent: QuotaAgent): agent is ManagedAgent {
	return agent === "claude" || agent === "codex";
}

/**
 * The quota panel's agent sections, in display order. Managed agents keep
 * their section with no login on the host — that is where Add account
 * lives, so hiding it would leave no way to sign in. Grok and Antigravity
 * have no add flow, so an empty section would be a dead end; they appear
 * once a login exists.
 */
export function visibleQuotaAgents(
	accounts: ReadonlyArray<Pick<UsageAccount, "agent">>,
): QuotaAgent[] {
	return AGENT_ORDER.filter(
		(agent) =>
			isManagedAgent(agent) ||
			accounts.some((account) => account.agent === agent),
	);
}
