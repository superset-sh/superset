import type { PrLinkProvider } from "@superset/local-db";

const PROVIDER_BASE_URLS: Record<
	Exclude<PrLinkProvider, "custom" | "github">,
	string
> = {
	betterhub: "https://www.better-hub.com",
	devin: "https://app.devin.ai/review",
};

export function transformPrUrl(
	githubUrl: string,
	provider: PrLinkProvider,
	customBaseUrl?: string | null,
): string {
	if (provider === "github") return githubUrl;
	if (!githubUrl.includes("/pull/")) return githubUrl;

	const githubBase = "https://github.com";
	if (!githubUrl.startsWith(githubBase)) return githubUrl;

	if (provider === "custom") {
		if (!customBaseUrl) return githubUrl;
		const base = customBaseUrl.replace(/\/+$/, "");
		return githubUrl.replace(githubBase, base);
	}

	return githubUrl.replace(githubBase, PROVIDER_BASE_URLS[provider]);
}
