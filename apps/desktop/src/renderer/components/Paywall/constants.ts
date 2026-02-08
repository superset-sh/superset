import type { IconType } from "react-icons";
import {
	HiCloud,
	HiDevicePhoneMobile,
	HiOutlineClipboardDocumentList,
	HiOutlinePuzzlePiece,
	HiUsers,
} from "react-icons/hi2";

export const GATED_FEATURES = {
	INVITE_MEMBERS: "invite-members",
	INTEGRATIONS: "integrations",
	TASKS: "tasks",
	CLOUD_WORKSPACES: "cloud-workspaces",
	MOBILE_APP: "mobile-app",
} as const;

export type GatedFeature = (typeof GATED_FEATURES)[keyof typeof GATED_FEATURES];

export interface ProFeature {
	id: string;
	title: string;
	description: string;
	icon: IconType;
	iconColor: string;
	gradientColors: readonly [string, string, string, string];
	comingSoon?: boolean;
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
		id: "integrations",
		title: "Integrations",
		description:
			"Connect Linear, GitHub, and more to sync issues and PRs directly with your workspaces.",
		icon: HiOutlinePuzzlePiece,
		iconColor: "text-purple-500",
		gradientColors: ["#7c3aed", "#6d28d9", "#4c1d95", "#1a1a2e"],
	},
	{
		id: "tasks",
		title: "Tasks",
		description:
			"Track and manage tasks synced from Linear. Stay on top of your work without leaving Superset.",
		icon: HiOutlineClipboardDocumentList,
		iconColor: "text-emerald-500",
		gradientColors: ["#047857", "#065f46", "#064e3b", "#1a1a2e"],
	},
	{
		id: "cloud-workspaces",
		title: "Cloud Workspaces",
		description:
			"Access your workspaces from anywhere with cloud-hosted environments.",
		icon: HiCloud,
		iconColor: "text-amber-500",
		gradientColors: ["#b45309", "#92400e", "#78350f", "#1a1a2e"],
		comingSoon: true,
	},
	{
		id: "mobile-app",
		title: "Mobile App",
		description:
			"Monitor workspaces and manage tasks on the go. Continue conversations from anywhere.",
		icon: HiDevicePhoneMobile,
		iconColor: "text-red-500",
		gradientColors: ["#7f1d1d", "#991b1b", "#450a0a", "#1a1a2e"],
		comingSoon: true,
	},
];

// Map gated feature IDs to the feature to highlight in the paywall dialog
export const FEATURE_ID_MAP: Record<GatedFeature, string> = {
	[GATED_FEATURES.INVITE_MEMBERS]: "team-collaboration",
	[GATED_FEATURES.INTEGRATIONS]: "integrations",
	[GATED_FEATURES.TASKS]: "tasks",
	[GATED_FEATURES.CLOUD_WORKSPACES]: "cloud-workspaces",
	[GATED_FEATURES.MOBILE_APP]: "mobile-app",
};
