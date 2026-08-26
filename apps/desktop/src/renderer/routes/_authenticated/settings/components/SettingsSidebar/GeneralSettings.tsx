import { cn } from "@superset/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	HiOutlineBeaker,
	HiOutlineBell,
	HiOutlineBuildingOffice2,
	HiOutlineChartBar,
	HiOutlineCommandLine,
	HiOutlineComputerDesktop,
	HiOutlineCpuChip,
	HiOutlineCreditCard,
	HiOutlineFolder,
	HiOutlineGlobeAlt,
	HiOutlineKey,
	HiOutlineLink,
	HiOutlineLockClosed,
	HiOutlinePaintBrush,
	HiOutlinePuzzlePiece,
	HiOutlineShieldCheck,
	HiOutlineSparkles,
	HiOutlineUser,
	HiOutlineUserGroup,
} from "react-icons/hi2";
import { LuBrain, LuGitBranch, LuKeyboard } from "react-icons/lu";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { SettingsSection } from "renderer/stores/settings-state";
import { getAllowedSectionsForVariant } from "../../utils/settings-search";
import { settingsListItemClass } from "../SettingsListSidebar";

interface GeneralSettingsProps {
	matchCounts: Partial<Record<SettingsSection, number>> | null;
}

type SettingsRoute =
	| "/settings/account"
	| "/settings/organization"
	| "/settings/teams"
	| "/settings/appearance"
	| "/settings/ringtones"
	| "/settings/usage"
	| "/settings/keyboard"
	| "/settings/behavior"
	| "/settings/browser"
	| "/settings/git"
	| "/settings/agents"
	| "/settings/terminal"
	| "/settings/links"
	| "/settings/models"
	| "/settings/experimental"
	| "/settings/integrations"
	| "/settings/billing"
	| "/settings/api-keys"
	| "/settings/security"
	| "/settings/permissions"
	| "/settings/projects"
	| "/settings/hosts";

interface SectionItem {
	id: SettingsRoute;
	section: SettingsSection;
	label: string;
	icon: React.ReactNode;
	macOnly?: boolean;
	/** Content wants the full pane width instead of the default centered max-w-4xl column. */
	fullWidth?: boolean;
}

interface SectionGroup {
	label: string;
	items: SectionItem[];
}

const SECTION_GROUPS: SectionGroup[] = [
	{
		label: "Personal",
		items: [
			{
				id: "/settings/account",
				section: "account",
				label: "Account",
				icon: <HiOutlineUser className="h-4 w-4" />,
			},
			{
				id: "/settings/appearance",
				section: "appearance",
				label: "Appearance",
				icon: <HiOutlinePaintBrush className="h-4 w-4" />,
			},
			{
				id: "/settings/ringtones",
				section: "ringtones",
				label: "Notifications",
				icon: <HiOutlineBell className="h-4 w-4" />,
			},
			{
				id: "/settings/usage",
				section: "usage",
				label: "Usage",
				icon: <HiOutlineChartBar className="h-4 w-4" />,
				fullWidth: true,
			},
		],
	},
	{
		label: "Editor & Workflow",
		items: [
			{
				id: "/settings/behavior",
				section: "behavior",
				label: "General",
				icon: <HiOutlineSparkles className="h-4 w-4" />,
			},
			{
				id: "/settings/keyboard",
				section: "keyboard",
				label: "Keyboard",
				icon: <LuKeyboard className="h-4 w-4" />,
			},
			{
				id: "/settings/git",
				section: "git",
				label: "Git & Worktrees",
				icon: <LuGitBranch className="h-4 w-4" />,
			},
			{
				id: "/settings/agents",
				section: "agents",
				label: "Agents",
				icon: <HiOutlineCpuChip className="h-4 w-4" />,
				fullWidth: true,
			},
			{
				id: "/settings/terminal",
				section: "terminal",
				label: "Terminal",
				icon: <HiOutlineCommandLine className="h-4 w-4" />,
			},
			{
				id: "/settings/links",
				section: "links",
				label: "Links",
				icon: <HiOutlineLink className="h-4 w-4" />,
			},
			{
				id: "/settings/browser",
				section: "browser",
				label: "Browser",
				icon: <HiOutlineGlobeAlt className="h-4 w-4" />,
			},
			{
				id: "/settings/models",
				section: "models",
				label: "Models",
				icon: <LuBrain className="h-4 w-4" />,
			},
		],
	},
	{
		label: "Organization",
		items: [
			{
				id: "/settings/organization",
				section: "organization",
				label: "Organization",
				icon: <HiOutlineBuildingOffice2 className="h-4 w-4" />,
			},
			{
				id: "/settings/teams",
				section: "teams",
				label: "Teams",
				icon: <HiOutlineUserGroup className="h-4 w-4" />,
			},
			{
				id: "/settings/projects",
				section: "project",
				label: "Projects",
				icon: <HiOutlineFolder className="h-4 w-4" />,
				fullWidth: true,
			},
			{
				id: "/settings/hosts",
				section: "hosts",
				label: "Hosts",
				icon: <HiOutlineComputerDesktop className="h-4 w-4" />,
				fullWidth: true,
			},
			{
				id: "/settings/integrations",
				section: "integrations",
				label: "Integrations",
				icon: <HiOutlinePuzzlePiece className="h-4 w-4" />,
			},
			{
				id: "/settings/billing",
				section: "billing",
				label: "Billing",
				icon: <HiOutlineCreditCard className="h-4 w-4" />,
			},
			{
				id: "/settings/api-keys",
				section: "apikeys",
				label: "API Keys",
				icon: <HiOutlineKey className="h-4 w-4" />,
			},
		],
	},
	{
		label: "System",
		items: [
			{
				id: "/settings/security",
				section: "security",
				label: "Remote Workspaces",
				icon: <HiOutlineLockClosed className="h-4 w-4" />,
			},
			{
				id: "/settings/permissions",
				section: "permissions",
				label: "Permissions",
				icon: <HiOutlineShieldCheck className="h-4 w-4" />,
				macOnly: true,
			},
			{
				id: "/settings/experimental",
				section: "experimental",
				label: "Experimental",
				icon: <HiOutlineBeaker className="h-4 w-4" />,
			},
		],
	},
];

/**
 * Settings sections whose content wants the full pane width instead of the
 * default centered max-w-4xl column — read by the Settings layout so a new
 * full-width section only needs to be marked here, not also in a second,
 * disconnected path list.
 */
export const FULL_WIDTH_SECTION_PATHS: readonly string[] =
	SECTION_GROUPS.flatMap((group) =>
		group.items.filter((item) => item.fullWidth).map((item) => item.id),
	);

export function GeneralSettings({ matchCounts }: GeneralSettingsProps) {
	const matchRoute = useMatchRoute();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const allowedSections = useMemo(
		() => getAllowedSectionsForVariant(isV2CloudEnabled),
		[isV2CloudEnabled],
	);

	return (
		<>
			{SECTION_GROUPS.map((group, groupIndex) => {
				const platformItems = group.items.filter(
					(item) =>
						(!item.macOnly || isMac) && allowedSections.has(item.section),
				);
				const filteredItems = matchCounts
					? platformItems.filter((item) => (matchCounts[item.section] ?? 0) > 0)
					: platformItems;

				if (filteredItems.length === 0) return null;

				return (
					<div key={group.label} className={cn(groupIndex > 0 && "mt-4")}>
						<h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.075em] px-3 mb-1">
							{group.label}
						</h2>
						<nav className="flex flex-col">
							{filteredItems.map((section) => {
								const isActive = !!matchRoute({
									to: section.id,
									fuzzy: true,
								});
								const count = matchCounts?.[section.section];

								return (
									<Link
										key={section.id}
										to={section.id}
										className={settingsListItemClass(
											isActive,
											"gap-2 px-3 text-left",
										)}
									>
										{section.icon}
										<span className="flex-1">{section.label}</span>
										{count !== undefined && count > 0 && (
											<span className="text-xs text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
												{count}
											</span>
										)}
									</Link>
								);
							})}
						</nav>
					</div>
				);
			})}
		</>
	);
}
