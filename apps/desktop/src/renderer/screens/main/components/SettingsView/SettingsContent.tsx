import type { SettingsSection } from "renderer/stores";
import { AccountSettings } from "./AccountSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { BehaviorSettings } from "./BehaviorSettings";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";
import { PresetsSettings } from "./PresetsSettings";
import { ProjectSettings } from "./ProjectSettings";
import { RingtonesSettings } from "./RingtonesSettings";
import { WorkspaceSettings } from "./WorkspaceSettings";

interface SettingsContentProps {
	activeSection: SettingsSection;
}

export function SettingsContent({ activeSection }: SettingsContentProps) {
	return (
		<div className="h-full overflow-y-auto flex justify-center">
			{activeSection === "account" && <AccountSettings />}
			{activeSection === "project" && <ProjectSettings />}
			{activeSection === "workspace" && <WorkspaceSettings />}
			{activeSection === "appearance" && <AppearanceSettings />}
			{activeSection === "ringtones" && <RingtonesSettings />}
			{activeSection === "keyboard" && <KeyboardShortcutsSettings />}
			{activeSection === "presets" && <PresetsSettings />}
			{activeSection === "behavior" && <BehaviorSettings />}
		</div>
	);
}
