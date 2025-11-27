import { AppearanceSettings } from "./AppearanceSettings";
import type { SettingsSection } from "./index";

interface SettingsContentProps {
	activeSection: SettingsSection;
}

export function SettingsContent({ activeSection }: SettingsContentProps) {
	return (
		<div className="h-full overflow-y-auto">
			{activeSection === "appearance" && <AppearanceSettings />}
		</div>
	);
}
