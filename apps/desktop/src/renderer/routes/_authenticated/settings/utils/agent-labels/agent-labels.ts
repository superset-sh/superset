import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";

export const AGENT_LABELS: Record<UsageAccount["agent"], string> = {
	claude: "Claude Code",
	codex: "Codex",
	grok: "Grok",
	agy: "Antigravity",
	opencode: "OpenCode",
};
