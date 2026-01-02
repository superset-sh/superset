import { HiArrowLeft, HiMagnifyingGlass } from "react-icons/hi2";
import { type SettingsSection, useCloseSettings } from "renderer/stores";
import { getMatchCountBySection } from "../settings-search";
import { GeneralSettings } from "./GeneralSettings";
import { ProjectsSettings } from "./ProjectsSettings";

interface SettingsSidebarProps {
	activeSection: SettingsSection;
	onSectionChange: (section: SettingsSection) => void;
	searchQuery: string;
	onSearchChange: (query: string) => void;
}

export function SettingsSidebar({
	activeSection,
	onSectionChange,
	searchQuery,
	onSearchChange,
}: SettingsSidebarProps) {
	const closeSettings = useCloseSettings();
	const matchCounts = searchQuery ? getMatchCountBySection(searchQuery) : null;

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

			{/* Search input */}
			<div className="relative px-1 mb-4">
				<HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search settings..."
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					className="w-full h-8 pl-8 pr-3 text-sm bg-accent/50 rounded-md border-0 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
				/>
			</div>

			<div className="flex-1 overflow-y-auto min-h-0">
				<GeneralSettings
					activeSection={activeSection}
					onSectionChange={onSectionChange}
					matchCounts={matchCounts}
				/>
				<ProjectsSettings
					activeSection={activeSection}
					onSectionChange={onSectionChange}
					searchQuery={searchQuery}
				/>
			</div>
		</div>
	);
}
