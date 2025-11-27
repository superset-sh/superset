import { useState } from "react";
import { SettingsContent } from "./SettingsContent";
import { SettingsSidebar } from "./SettingsSidebar";

export type SettingsSection = "appearance";

export function SettingsView() {
	const [activeSection, setActiveSection] =
		useState<SettingsSection>("appearance");

	return (
		<div className="flex flex-1 bg-tertiary">
			<SettingsSidebar
				activeSection={activeSection}
				onSectionChange={setActiveSection}
			/>
			<div className="flex-1 m-3 bg-background rounded overflow-hidden">
				<SettingsContent activeSection={activeSection} />
			</div>
		</div>
	);
}
