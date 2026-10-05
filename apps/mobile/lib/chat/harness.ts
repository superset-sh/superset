const HARNESS_BY_AGENT: Record<string, string> = {
	claude: "claude-acp",
	codex: "codex-acp",
	pi: "pi-acp",
};

const AGENT_BY_HARNESS: Record<string, string> = {
	"claude-acp": "claude",
	"claude-code": "claude",
	"codex-acp": "codex",
	codex: "codex",
	"pi-acp": "pi",
};

/** Mirrors desktop's acpHarnessForPreset: only these agents open as a chat. */
export function harnessForAgent(
	agentId: string | null | undefined,
): string | undefined {
	return agentId ? HARNESS_BY_AGENT[agentId] : undefined;
}

export function agentIdForHarness(harness: string): string | null {
	return AGENT_BY_HARNESS[harness] ?? null;
}
