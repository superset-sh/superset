import { cn } from "@superset/ui/utils";
import {
	HiOutlineBell,
	HiOutlineCog6Tooth,
	HiOutlineCommandLine,
	HiOutlinePaintBrush,
} from "react-icons/hi2";
import type { SettingsSection } from "renderer/stores";

interface GeneralSettingsProps {
	activeSection: SettingsSection;
	onSectionChange: (section: SettingsSection) => void;
}

const GENERAL_SECTIONS: {
	id: SettingsSection;
	label: string;
	icon: React.ReactNode;
}[] = [
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
];

export function GeneralSettings({
	activeSection,
	onSectionChange,
}: GeneralSettingsProps) {
	return (
		<div className="mb-4">
			<h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
				General
			</h2>
			<nav className="flex flex-col gap-0.5">
				{GENERAL_SECTIONS.map((section) => (
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
						{section.label}
					</button>
				))}
			</nav>
		</div>
	);
}
