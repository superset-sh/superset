export const GATED_FEATURES = {
	INVITE_MEMBERS: "invite-members",
	TASKS: "tasks",
	REMOTE_ACCESS: "remote-access",
	MOBILE_APP: "mobile-app",
	AUTOMATIONS: "automations",
} as const;

export type GatedFeature = (typeof GATED_FEATURES)[keyof typeof GATED_FEATURES];

// Map gated feature IDs to the feature to highlight in the paywall dialog
export const FEATURE_ID_MAP: Record<GatedFeature, string> = {
	[GATED_FEATURES.INVITE_MEMBERS]: "team-collaboration",
	[GATED_FEATURES.TASKS]: "tasks",
	[GATED_FEATURES.REMOTE_ACCESS]: "remote-access",
	[GATED_FEATURES.MOBILE_APP]: "mobile-app",
	[GATED_FEATURES.AUTOMATIONS]: "automations",
};
