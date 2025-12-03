import { HiArrowLeft } from "react-icons/hi2";
import { type SettingsSection, useCloseSettings } from "renderer/stores";
import { GeneralSettings } from "./GeneralSettings";
import { ProjectsSettings } from "./ProjectsSettings";

interface SettingsSidebarProps {
	activeSection: SettingsSection;
	onSectionChange: (section: SettingsSection) => void;
}

export function SettingsSidebar({
	activeSection,
	onSectionChange,
}: SettingsSidebarProps) {
	const closeSettings = useCloseSettings();

	return (
		<div className="w-56 flex flex-col p-3 overflow-hidden">
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

			<div className="flex-1 overflow-y-auto min-h-0">
				<GeneralSettings
					activeSection={activeSection}
					onSectionChange={onSectionChange}
				/>
				<ProjectsSettings
					activeSection={activeSection}
					onSectionChange={onSectionChange}
				/>
			</div>
		</div>
	);
}
