import type { SettingsSection } from "renderer/stores";
import { AccountSettings } from "./AccountSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { BehaviorSettings } from "./BehaviorSettings";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";
import { PresetsSettings } from "./PresetsSettings";
import { ProjectSettings } from "./ProjectSettings";
import { RingtonesSettings } from "./RingtonesSettings";
import { getMatchingItemsForSection } from "./settings-search";
import { WorkspaceSettings } from "./WorkspaceSettings";

interface SettingsContentProps {
	activeSection: SettingsSection;
	searchQuery?: string;
}

export function SettingsContent({
	activeSection,
	searchQuery = "",
}: SettingsContentProps) {
	const matchingItems = searchQuery
		? getMatchingItemsForSection(searchQuery, activeSection)
		: null;
	const matchingIds = matchingItems?.map((item) => item.id) ?? null;

	return (
		<div className="h-full overflow-y-auto flex justify-center">
			{activeSection === "account" && (
				<AccountSettings visibleItems={matchingIds} />
			)}
			{activeSection === "project" && <ProjectSettings />}
			{activeSection === "workspace" && <WorkspaceSettings />}
			{activeSection === "appearance" && (
				<AppearanceSettings visibleItems={matchingIds} />
			)}
			{activeSection === "ringtones" && (
				<RingtonesSettings visibleItems={matchingIds} />
			)}
			{activeSection === "keyboard" && <KeyboardShortcutsSettings />}
			{activeSection === "presets" && <PresetsSettings />}
			{activeSection === "behavior" && (
				<BehaviorSettings visibleItems={matchingIds} />
			)}
		</div>
	);
}
