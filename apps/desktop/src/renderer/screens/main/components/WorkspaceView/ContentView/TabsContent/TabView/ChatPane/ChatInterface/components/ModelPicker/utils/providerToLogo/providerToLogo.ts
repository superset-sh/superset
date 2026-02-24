export const ANTHROPIC_LOGO_PROVIDER = "anthropic";

/** Derive a logo provider slug from the provider name */
export function providerToLogo(provider: string): string {
	const lower = provider.toLowerCase();
	if (lower.includes("anthropic") || lower.includes("claude")) {
		return ANTHROPIC_LOGO_PROVIDER;
	}
	if (lower.includes("openai") || lower.includes("gpt")) return "openai";
	if (lower.includes("google") || lower.includes("gemini")) return "google";
	if (lower.includes("mistral")) return "mistral";
	if (lower.includes("deepseek")) return "deepseek";
	if (lower.includes("xai") || lower.includes("grok")) return "xai";
	return lower;
}
