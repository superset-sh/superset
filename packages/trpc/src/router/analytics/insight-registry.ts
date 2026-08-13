// Canonical admin dashboard tiles: the event-based insights of PostHog
// dashboard 1884562, referenced by short_id. Definitions live in PostHog;
// recovery from bad edits is via PostHog's activity log (field-level diffs).
export const ADMIN_INSIGHTS = {
	dau: "7mbktvP7",
	wau: "82RAL00l",
	activationFunnel: "Es6Yu3Lr",
	activatedRate: "zGsBNGi3",
	cohortRetention: "l68EUWqk",
	workspacePercentiles: "Kw6Kwwip",
	workspacesPerCreator: "crHk64hw",
	newSiteVisitors: "dF6CnJ8m",
	downloadCtrMac: "2LtmVxFY",
	activeOrgs: "IlEQoT55",
} as const;

export type AdminInsightKey = keyof typeof ADMIN_INSIGHTS;

export const ADMIN_INSIGHT_KEYS = Object.keys(ADMIN_INSIGHTS) as [
	AdminInsightKey,
	...AdminInsightKey[],
];

export const POSTHOG_PROJECT_URL = "https://us.posthog.com/project/264803";
