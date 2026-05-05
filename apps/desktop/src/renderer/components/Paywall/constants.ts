import type { IconType } from "react-icons";
import {
	HiDevicePhoneMobile,
	HiOutlineClipboardDocumentList,
	HiOutlineSignal,
	HiUsers,
} from "react-icons/hi2";
import { LuClock } from "react-icons/lu";

export const GATED_FEATURES = {
	INVITE_MEMBERS: "invite-members",
	TASKS: "tasks",
	AUTOMATIONS: "automations",
	REMOTE_WORKSPACES: "remote-workspaces",
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
		id: "remote-workspaces",
		title: "Remote Workspaces",
		description:
			"Reach this Mac from anywhere via the Superset relay, or spin up cloud workspaces. Connect from any client.",
		icon: HiOutlineSignal,
		iconColor: "text-pink-500",
		gradientColors: ["#be185d", "#9d174d", "#831843", "#1a1a2e"],
	},
	{
		id: "automations",
		title: "Automations",
		description:
			"Run agents on a schedule. Kick off PR reviews, refactors, and recurring chores without lifting a finger.",
		icon: LuClock,
		iconColor: "text-cyan-500",
		gradientColors: ["#0e7490", "#155e75", "#164e63", "#1a1a2e"],
	},
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
		id: "tasks",
		title: "Tasks",
		description:
			"Track and manage tasks synced from Linear. Stay on top of your work without leaving Superset.",
		icon: HiOutlineClipboardDocumentList,
		iconColor: "text-emerald-500",
		gradientColors: ["#047857", "#065f46", "#064e3b", "#1a1a2e"],
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
	[GATED_FEATURES.TASKS]: "tasks",
	[GATED_FEATURES.AUTOMATIONS]: "automations",
	[GATED_FEATURES.REMOTE_WORKSPACES]: "remote-workspaces",
	[GATED_FEATURES.MOBILE_APP]: "mobile-app",
};
