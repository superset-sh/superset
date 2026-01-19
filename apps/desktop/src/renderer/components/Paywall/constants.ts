import type { IconType } from "react-icons";
import { HiUsers } from "react-icons/hi2";
import { IoSparkles, IoTerminal } from "react-icons/io5";
import { MdWorkspaces } from "react-icons/md";
import { RiRocketLine } from "react-icons/ri";
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
		id: "ai-features",
		title: "AI-Powered Features",
		description:
			"Enhanced AI agent capabilities with context-aware completions, automated workflow suggestions, and intelligent terminal assistance.",
		icon: IoSparkles,
		iconColor: "text-purple-500",
		gradientColors: ["#6b21a8", "#581c87", "#3b0764", "#1a1a2e"],
	},
	{
		id: "advanced-terminal",
		title: "Advanced Terminal",
		description:
			"Split your terminal into multiple panes for parallel execution. Session persistence, custom themes, and comprehensive command history search.",
		icon: IoTerminal,
		iconColor: "text-green-500",
		gradientColors: ["#047857", "#065f46", "#064e3b", "#1a1a2e"],
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
		id: "priority-support",
		title: "Priority Support",
		description:
			"Priority email support from the Superset team. Early access to new Pro features and beta releases.",
		icon: RiRocketLine,
		iconColor: "text-red-500",
		gradientColors: ["#7f1d1d", "#991b1b", "#450a0a", "#1a1a2e"],
	},
];

// Map gated feature IDs to the feature to highlight in the paywall dialog
export const FEATURE_ID_MAP: Record<GatedFeature, string> = {
	[GATED_FEATURES.INVITE_MEMBERS]: "team-collaboration",
	[GATED_FEATURES.AI_COMPLETION]: "ai-features",
	[GATED_FEATURES.SPLIT_TERMINAL]: "advanced-terminal",
	[GATED_FEATURES.CREATE_WORKSPACE]: "unlimited-workspaces",
};
