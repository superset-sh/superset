import type { PrLinkProvider } from "@superset/local-db";

export const PR_LINK_PROVIDER_LABELS: Record<PrLinkProvider, string> = {
	github: "GitHub",
	betterhub: "BetterHub",
	devin: "Devin",
	custom: "Custom",
};
