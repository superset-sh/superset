import { msg } from "@lingui/core/macro";
import { GATED_FEATURES } from "renderer/components/Paywall";

export const GETTING_STARTED_STEPS = [
	{
		progressIndex: 1,
		label: msg({ message: "Enable remote access" }),
		feature: GATED_FEATURES.REMOTE_ACCESS,
		to: "/settings/security",
	},
	{
		progressIndex: 0,
		label: msg({ message: "Use Superset on mobile" }),
		feature: GATED_FEATURES.MOBILE_APP,
		to: "/settings/mobile",
	},
	{
		progressIndex: 2,
		label: msg({ message: "Set up an automation" }),
		feature: GATED_FEATURES.AUTOMATIONS,
		to: "/automations",
	},
] as const;
