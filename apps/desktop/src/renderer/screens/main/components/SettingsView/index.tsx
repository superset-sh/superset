import { useEffect, useState } from "react";
import {
	useSetSettingsSection,
	useSettingsSection,
} from "renderer/stores/app-state";
import { SettingsContent } from "./SettingsContent";
import { SettingsSidebar } from "./SettingsSidebar";
import { getMatchCountBySection } from "./settings-search";

// Order of sections in the sidebar
const SECTION_ORDER = [
	"account",
	"appearance",
	"ringtones",
	"keyboard",
	"presets",
	"behavior",
] as const;

export function SettingsView() {
	const activeSection = useSettingsSection();
	const setActiveSection = useSetSettingsSection();
	const [searchQuery, setSearchQuery] = useState("");

	// Auto-select first matching section if current section is filtered out
	useEffect(() => {
		if (!searchQuery) return;

		const matchCounts = getMatchCountBySection(searchQuery);
		const currentHasMatches = (matchCounts[activeSection] ?? 0) > 0;

		if (!currentHasMatches) {
			// Find first section with matches
			const firstMatch = SECTION_ORDER.find(
				(section) => (matchCounts[section] ?? 0) > 0,
			);
			if (firstMatch) {
				setActiveSection(firstMatch);
			}
		}
	}, [searchQuery, activeSection, setActiveSection]);

	return (
		<div className="flex flex-1 bg-tertiary">
			<SettingsSidebar
				activeSection={activeSection}
				onSectionChange={setActiveSection}
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
			/>
			<div className="flex-1 m-3 bg-background rounded overflow-hidden">
				<SettingsContent
					activeSection={activeSection}
					searchQuery={searchQuery}
				/>
			</div>
		</div>
	);
}
