import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { IconType } from "react-icons";
import { FaSlack } from "react-icons/fa";
import {
	HiDevicePhoneMobile,
	HiOutlineClipboardDocumentList,
	HiOutlineSignal,
	HiUsers,
} from "react-icons/hi2";

export const GATED_FEATURES = {
	INVITE_MEMBERS: "invite-members",
	TASKS: "tasks",
	REMOTE_ACCESS: "remote-access",
	MOBILE_APP: "mobile-app",
} as const;

export type GatedFeature = (typeof GATED_FEATURES)[keyof typeof GATED_FEATURES];

export interface ProFeature {
	id: string;
	title: MessageDescriptor;
	description: MessageDescriptor;
	icon: IconType;
	iconColor: string;
	gradientColors: readonly [string, string, string, string];
	comingSoon?: boolean;
}

export const PRO_FEATURES: ProFeature[] = [
	{
		id: "remote-access",
		title: msg({
			id: "components.paywall.remoteAccess.title",
			message: "Remote Access",
		}),
		description: msg({
			id: "components.paywall.remoteAccess.description",
			message:
				"Reach this Mac from anywhere via the Superset relay, or spin up cloud workspaces. Connect from any client.",
		}),
		icon: HiOutlineSignal,
		iconColor: "text-pink-500",
		gradientColors: ["#be185d", "#9d174d", "#831843", "#1a1a2e"],
	},
	{
		id: "team-collaboration",
		title: msg({
			id: "components.paywall.teamCollaboration.title",
			message: "Team Collaboration",
		}),
		description: msg({
			id: "components.paywall.teamCollaboration.description",
			message:
				"Invite your team to shared workspaces. See real-time updates, sync configurations, and manage team access across agents.",
		}),
		icon: HiUsers,
		iconColor: "text-blue-500",
		gradientColors: ["#1e40af", "#1e3a8a", "#172554", "#1a1a2e"],
	},
	{
		id: "tasks",
		title: msg({
			id: "components.paywall.tasks.title",
			message: "Tasks",
		}),
		description: msg({
			id: "components.paywall.tasks.description",
			message:
				"Track and manage tasks synced from Linear. Stay on top of your work without leaving Superset.",
		}),
		icon: HiOutlineClipboardDocumentList,
		iconColor: "text-emerald-500",
		gradientColors: ["#047857", "#065f46", "#064e3b", "#1a1a2e"],
	},
	{
		id: "slack-integration",
		title: msg({
			id: "components.paywall.slackIntegration.title",
			message: "Slack Integration",
		}),
		description: msg({
			id: "components.paywall.slackIntegration.description",
			message:
				"Turn Slack conversations into tasks, run agents from your workspace, and keep teammates in the loop where work starts.",
		}),
		icon: FaSlack,
		iconColor: "text-violet-500",
		gradientColors: ["#7c3aed", "#4f46e5", "#0f766e", "#1a1a2e"],
	},
	{
		id: "mobile-app",
		title: msg({
			id: "components.paywall.mobileApp.title",
			message: "Mobile App",
		}),
		description: msg({
			id: "components.paywall.mobileApp.description",
			message:
				"Monitor workspaces and manage tasks on the go. Continue conversations from anywhere.",
		}),
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
	[GATED_FEATURES.REMOTE_ACCESS]: "remote-access",
	[GATED_FEATURES.MOBILE_APP]: "mobile-app",
};
