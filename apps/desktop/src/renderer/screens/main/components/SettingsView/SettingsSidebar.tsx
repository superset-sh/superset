import { cn } from "@superset/ui/utils";
import {
	HiArrowLeft,
	HiOutlineCommandLine,
	HiOutlinePaintBrush,
} from "react-icons/hi2";
import { type SettingsSection, useCloseSettings } from "renderer/stores";

interface SettingsSidebarProps {
	activeSection: SettingsSection;
	onSectionChange: (section: SettingsSection) => void;
}

const SECTIONS: {
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
		id: "keyboard",
		label: "Keyboard Shortcuts",
		icon: <HiOutlineCommandLine className="h-4 w-4" />,
	},
];

export function SettingsSidebar({
	activeSection,
	onSectionChange,
}: SettingsSidebarProps) {
	const closeSettings = useCloseSettings();

	return (
		<div className="w-56 flex flex-col p-3">
			{/* Back button */}
			<button
				type="button"
				onClick={closeSettings}
				className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
			>
				<HiArrowLeft className="h-4 w-4" />
				<span>Back</span>
			</button>

			{/* Settings title */}
			<h1 className="text-lg font-semibold px-3 mb-4">Settings</h1>

			{/* Navigation */}
			<nav className="flex flex-col gap-1">
				{SECTIONS.map((section) => (
					<button
						key={section.id}
						type="button"
						onClick={() => onSectionChange(section.id)}
						className={cn(
							"flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors text-left",
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
