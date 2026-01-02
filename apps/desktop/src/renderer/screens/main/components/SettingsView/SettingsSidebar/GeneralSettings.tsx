import { cn } from "@superset/ui/utils";
import {
	HiOutlineAdjustmentsHorizontal,
	HiOutlineBell,
	HiOutlineCog6Tooth,
	HiOutlineCommandLine,
	HiOutlinePaintBrush,
	HiOutlineUser,
} from "react-icons/hi2";
import type { SettingsSection } from "renderer/stores";

interface GeneralSettingsProps {
	activeSection: SettingsSection;
	onSectionChange: (section: SettingsSection) => void;
	matchCounts?: Record<SettingsSection, number> | null;
}

/**
 * Sidebar section definitions.
 * Search keywords are centralized in settings-search.ts - do not duplicate here.
 */
const GENERAL_SECTIONS: {
	id: SettingsSection;
	label: string;
	icon: React.ReactNode;
}[] = [
	{
		id: "account",
		label: "Account",
		icon: <HiOutlineUser className="h-4 w-4" />,
	},
	{
		id: "appearance",
		label: "Appearance",
		icon: <HiOutlinePaintBrush className="h-4 w-4" />,
	},
	{
		id: "ringtones",
		label: "Ringtones",
		icon: <HiOutlineBell className="h-4 w-4" />,
	},
	{
		id: "keyboard",
		label: "Keyboard Shortcuts",
		icon: <HiOutlineCommandLine className="h-4 w-4" />,
	},
	{
		id: "presets",
		label: "Presets",
		icon: <HiOutlineCog6Tooth className="h-4 w-4" />,
	},
	{
		id: "behavior",
		label: "Behavior",
		icon: <HiOutlineAdjustmentsHorizontal className="h-4 w-4" />,
	},
];

export function GeneralSettings({
	activeSection,
	onSectionChange,
	matchCounts,
}: GeneralSettingsProps) {
	// When searching, only show sections that have matches
	const filteredSections = matchCounts
		? GENERAL_SECTIONS.filter((section) => (matchCounts[section.id] ?? 0) > 0)
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
					const count = matchCounts?.[section.id];
					return (
						<button
							key={section.id}
							type="button"
							onClick={() => onSectionChange(section.id)}
							className={cn(
								"flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors text-left",
								activeSection === section.id
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
							)}
						>
							{section.icon}
							<span className="flex-1">{section.label}</span>
							{count !== undefined && count > 0 && (
								<span className="text-xs text-muted-foreground">{count}</span>
							)}
						</button>
					);
				})}
			</nav>
		</div>
	);
}
