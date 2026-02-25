export const ANTHROPIC_LOGO_PROVIDER = "anthropic";
export const OPENAI_LOGO_PROVIDER = "openai";

/** Derive a logo provider slug from the provider name */
export function providerToLogo(provider: string): string {
	const lower = provider.toLowerCase();
	if (lower.includes("anthropic") || lower.includes("claude")) {
		return ANTHROPIC_LOGO_PROVIDER;
	}
	if (
		lower.includes("openai") ||
		lower.includes("gpt") ||
		lower.includes("o3") ||
		lower.includes("codex")
	)
		return OPENAI_LOGO_PROVIDER;
	if (lower.includes("google") || lower.includes("gemini")) return "google";
	if (lower.includes("mistral")) return "mistral";
	if (lower.includes("deepseek")) return "deepseek";
	if (lower.includes("xai") || lower.includes("grok")) return "xai";
	return lower;
}
