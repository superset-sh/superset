import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiOutlineCog6Tooth } from "react-icons/hi2";
import { useOpenSettings } from "renderer/stores";
import { formatKeysForDisplay, HOTKEYS } from "shared/hotkeys";

export function SettingsButton() {
	const openSettings = useOpenSettings();
	const keys = formatKeysForDisplay(HOTKEYS.SHOW_HOTKEYS.keys);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={() => openSettings()}
					className="no-drag flex h-8 w-8 items-center justify-center rounded-md text-accent-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
					aria-label="Open settings"
				>
					<HiOutlineCog6Tooth className="h-4 w-4" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				<span className="flex items-center gap-2">
					Settings
					<KbdGroup>
						{keys.map((key) => (
							<Kbd key={key}>{key}</Kbd>
						))}
					</KbdGroup>
				</span>
			</TooltipContent>
		</Tooltip>
	);
}
