import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { CiSettings } from "react-icons/ci";
import { useOpenSettings } from "renderer/stores";
import { HOTKEYS } from "shared/hotkeys";

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
				<span className="flex items-center gap-2">
					Open settings
					<KbdGroup>
						{HOTKEYS.SHOW_HOTKEYS.display.map((key) => (
							<Kbd key={key}>{key}</Kbd>
						))}
					</KbdGroup>
				</span>
			</TooltipContent>
		</Tooltip>
	);
}
