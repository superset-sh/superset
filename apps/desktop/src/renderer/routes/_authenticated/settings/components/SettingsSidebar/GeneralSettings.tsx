import { cn } from "@superset/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";
import {
	HiOutlineBell,
	HiOutlineBuildingOffice2,
	HiOutlineCommandLine,
	HiOutlineCreditCard,
	HiOutlineDevicePhoneMobile,
	HiOutlineKey,
	HiOutlinePaintBrush,
	HiOutlinePuzzlePiece,
	HiOutlineSparkles,
	HiOutlineUser,
} from "react-icons/hi2";
import { LuKeyboard } from "react-icons/lu";
import type { SettingsSection } from "renderer/stores/settings-state";

interface GeneralSettingsProps {
	matchCounts: Partial<Record<SettingsSection, number>> | null;
}

type SettingsRoute =
	| "/settings/account"
	| "/settings/organization"
	| "/settings/appearance"
	| "/settings/ringtones"
	| "/settings/keyboard"
	| "/settings/behavior"
	| "/settings/terminal"
	| "/settings/integrations"
	| "/settings/billing"
	| "/settings/devices"
	| "/settings/api-keys";

const GENERAL_SECTIONS: {
	id: SettingsRoute;
	section: SettingsSection;
	label: string;
	icon: React.ReactNode;
}[] = [
	{
		id: "/settings/account",
		section: "account",
		label: "Account",
		icon: <HiOutlineUser className="h-4 w-4" />,
	},
	{
		id: "/settings/organization",
		section: "organization",
		label: "Organization",
		icon: <HiOutlineBuildingOffice2 className="h-4 w-4" />,
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
		id: "/settings/keyboard",
		section: "keyboard",
		label: "Keyboard",
		icon: <LuKeyboard className="h-4 w-4" />,
	},
	{
		id: "/settings/behavior",
		section: "behavior",
		label: "Features",
		icon: <HiOutlineSparkles className="h-4 w-4" />,
	},
	{
		id: "/settings/terminal",
		section: "terminal",
		label: "Terminal",
		icon: <HiOutlineCommandLine className="h-4 w-4" />,
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
		id: "/settings/devices",
		section: "devices",
		label: "Devices",
		icon: <HiOutlineDevicePhoneMobile className="h-4 w-4" />,
	},
	{
		id: "/settings/api-keys",
		section: "apikeys",
		label: "API Keys",
		icon: <HiOutlineKey className="h-4 w-4" />,
	},
];

export function GeneralSettings({ matchCounts }: GeneralSettingsProps) {
	const matchRoute = useMatchRoute();

	// When searching, only show sections that have matches
	const filteredSections = matchCounts
		? GENERAL_SECTIONS.filter(
				(section) => (matchCounts[section.section] ?? 0) > 0,
			)
		: GENERAL_SECTIONS;

	if (filteredSections.length === 0) {
		return null;
	}

	return (
		<div className="mb-4">
			<h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
				General
			</h2>
			<nav className="flex flex-col gap-0.5">
				{filteredSections.map((section) => {
					const isActive = matchRoute({ to: section.id });
					const count = matchCounts?.[section.section];

					return (
						<Link
							key={section.id}
							to={section.id}
							className={cn(
								"flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors text-left",
								isActive
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
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
}
