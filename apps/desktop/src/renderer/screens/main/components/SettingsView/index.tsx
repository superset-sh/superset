import {
	useSetSettingsSection,
	useSettingsSection,
} from "renderer/stores/app-state";
import { SettingsContent } from "./SettingsContent";
import { SettingsSidebar } from "./SettingsSidebar";

export function SettingsView() {
	const activeSection = useSettingsSection();
	const setActiveSection = useSetSettingsSection();

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
