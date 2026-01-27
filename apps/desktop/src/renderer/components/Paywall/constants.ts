import type { IconType } from "react-icons";
import {
	HiCloud,
	HiDevicePhoneMobile,
	HiOutlinePuzzlePiece,
	HiUsers,
} from "react-icons/hi2";
import { MdWorkspaces } from "react-icons/md";
import type { GatedFeature } from "./usePaywall";
import { GATED_FEATURES } from "./usePaywall";

export interface ProFeature {
	id: string;
	title: string;
	description: string;
	icon: IconType;
	iconColor: string;
	gradientColors: readonly [string, string, string, string];
}

export const PRO_FEATURES: ProFeature[] = [
	{
		id: "team-collaboration",
		title: "Team Collaboration",
		description:
			"Invite your team to shared workspaces. See real-time updates, sync configurations, and manage team access across agents.",
		icon: HiUsers,
		iconColor: "text-blue-500",
		gradientColors: ["#1e40af", "#1e3a8a", "#172554", "#1a1a2e"],
	},
	{
		id: "unlimited-workspaces",
		title: "Unlimited Workspaces",
		description:
			"Create as many workspaces and worktrees as you need. Organize complex multi-agent workflows without hitting limits.",
		icon: MdWorkspaces,
		iconColor: "text-orange-500",
		gradientColors: ["#b45309", "#92400e", "#78350f", "#1a1a2e"],
	},
	{
		id: "integrations",
		title: "Integrations",
		description:
			"Connect Linear, GitHub, and more to sync issues and PRs directly with your workspaces.",
		icon: HiOutlinePuzzlePiece,
		iconColor: "text-indigo-500",
		gradientColors: ["#4f46e5", "#4338ca", "#3730a3", "#1a1a2e"],
	},
	{
		id: "cloud-workspaces",
		title: "Cloud Workspaces",
		description:
			"Access your workspaces from anywhere with cloud-hosted environments.",
		icon: HiCloud,
		iconColor: "text-cyan-500",
		gradientColors: ["#0891b2", "#0e7490", "#155e75", "#1a1a2e"],
	},
	{
		id: "mobile-app",
		title: "Mobile App",
		description: "Monitor workspaces and manage tasks on the go.",
		icon: HiDevicePhoneMobile,
		iconColor: "text-pink-500",
		gradientColors: ["#be185d", "#9d174d", "#831843", "#1a1a2e"],
	},
];

// Map gated feature IDs to the feature to highlight in the paywall dialog
export const FEATURE_ID_MAP: Record<GatedFeature, string> = {
	[GATED_FEATURES.INVITE_MEMBERS]: "team-collaboration",
	[GATED_FEATURES.CREATE_WORKSPACE]: "unlimited-workspaces",
	[GATED_FEATURES.INTEGRATIONS]: "integrations",
	[GATED_FEATURES.CLOUD_WORKSPACES]: "cloud-workspaces",
	[GATED_FEATURES.MOBILE_APP]: "mobile-app",
};
