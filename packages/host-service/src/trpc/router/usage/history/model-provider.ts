import type { ModelProvider, UsageAgent } from "../types";

const DIRECT_PROVIDERS: Partial<Record<UsageAgent, ModelProvider>> = {
	claude: "anthropic",
	codex: "openai",
	grok: "xai",
	cursor: "cursor",
	copilot: "github",
};

/** Best-effort model-backend attribution. Agent identity remains authoritative;
 * this only describes who serves the selected model. */
export function inferModelProvider(
	agent: UsageAgent,
	model: string,
): ModelProvider {
	const direct = DIRECT_PROVIDERS[agent];
	if (direct) return direct;

	const normalized = model.toLowerCase();
	if (normalized.includes("claude") || normalized.startsWith("anthropic/"))
		return "anthropic";
	if (
		normalized.includes("gpt") ||
		normalized.includes("codex") ||
		normalized.startsWith("openai/")
	)
		return "openai";
	if (normalized.includes("gemini") || normalized.startsWith("google/"))
		return "google";
	if (normalized.includes("grok") || normalized.startsWith("xai/"))
		return "xai";
	return "other";
}
