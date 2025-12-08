import type { SettingsSection } from "renderer/stores";
import { AppearanceSettings } from "./AppearanceSettings";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";
import { PresetsSettings } from "./PresetsSettings";
import { ProjectSettings } from "./ProjectSettings";
import { WorkspaceSettings } from "./WorkspaceSettings";

interface SettingsContentProps {
	activeSection: SettingsSection;
}

export function SettingsContent({ activeSection }: SettingsContentProps) {
	return (
		<div className="h-full overflow-y-auto flex justify-center">
			{activeSection === "project" && <ProjectSettings />}
			{activeSection === "workspace" && <WorkspaceSettings />}
			{activeSection === "appearance" && <AppearanceSettings />}
			{activeSection === "keyboard" && <KeyboardShortcutsSettings />}
			{activeSection === "presets" && <PresetsSettings />}
		</div>
	);
}
