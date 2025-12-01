import type { SettingsSection } from "renderer/stores";
import { AppearanceSettings } from "./AppearanceSettings";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";

interface SettingsContentProps {
	activeSection: SettingsSection;
}

export function SettingsContent({ activeSection }: SettingsContentProps) {
	return (
		<div className="h-full overflow-y-auto flex justify-center">
			{activeSection === "appearance" && <AppearanceSettings />}
			{activeSection === "keyboard" && <KeyboardShortcutsSettings />}
		</div>
	);
}
