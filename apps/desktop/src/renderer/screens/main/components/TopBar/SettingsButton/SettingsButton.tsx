import { HiOutlineCog6Tooth } from "react-icons/hi2";
import { useOpenSettings } from "renderer/stores";

export function SettingsButton() {
	const openSettings = useOpenSettings();

	return (
		<button
			type="button"
			onClick={openSettings}
			className="no-drag flex h-8 w-8 items-center justify-center rounded-md text-accent-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
			aria-label="Open settings"
		>
			<HiOutlineCog6Tooth className="h-4 w-4" />
		</button>
	);
}
