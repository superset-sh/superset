/**
 * Agent config id → the ACP harness that can run it as a chat. An agent absent
 * here simply has no chat surface; the pane stays the terminal it was.
 *
 * This mirrors what the host serves — `ACP_ADAPTERS` entries with a `bundled`
 * distribution. An agent listed here that the host cannot run is worse than an
 * omission: its terminal is replaced by a chat whose session never starts.
 * Gemini and OpenCode are declared host-side but need provisioning first, so
 * they are deliberately absent.
 */
const ACP_HARNESS_BY_AGENT: Record<string, string> = {
	claude: "claude-acp",
	codex: "codex-acp",
	pi: "pi-acp",
};

/** The ACP harness that can resume this agent, if any can. */
export function acpHarnessForAgent(
	agentId: string | null | undefined,
): string | undefined {
	return agentId ? ACP_HARNESS_BY_AGENT[agentId] : undefined;
}
