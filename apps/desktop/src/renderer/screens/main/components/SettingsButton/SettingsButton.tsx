import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { CiSettings } from "react-icons/ci";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { useOpenSettings } from "renderer/stores";

export function SettingsButton() {
	const openSettings = useOpenSettings();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => openSettings()}
					aria-label="Open settings"
					className="no-drag"
				>
					<CiSettings className="size-5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" sideOffset={8}>
				<HotkeyTooltipContent label="Open settings" hotkeyId="SHOW_HOTKEYS" />
			</TooltipContent>
		</Tooltip>
	);
}
