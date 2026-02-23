import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { HiMiniCommandLine } from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent/HotkeyTooltipContent";
import { usePresets } from "renderer/react-query/presets";
import { PRESET_HOTKEY_IDS } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/usePresetHotkeys";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";

export function PresetsBar() {
	const { workspaceId } = useParams({ strict: false });
	const { presets } = usePresets();
	const isDark = useIsDarkTheme();
	const { openPreset } = useTabsWithPresets();

	if (presets.length === 0) return null;

	return (
		<div
			className="flex items-center h-8 border-b border-border bg-background px-2 gap-0.5 overflow-x-auto shrink-0"
			style={{ scrollbarWidth: "none" }}
		>
			{presets.map((preset, index) => {
				const icon = getPresetIcon(preset.name, isDark);
				const hotkeyId = PRESET_HOTKEY_IDS[index];
				const label = preset.description || preset.name || "default";
				return (
					<Tooltip key={preset.id}>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 gap-1.5 text-xs shrink-0"
								onClick={() => {
									if (workspaceId) {
										openPreset(workspaceId, preset, {
											target: "active-tab",
										});
									}
								}}
							>
								{icon ? (
									<img src={icon} alt="" className="size-3.5 object-contain" />
								) : (
									<HiMiniCommandLine className="size-3.5" />
								)}
								<span className="truncate max-w-[120px]">
									{preset.name || "default"}
								</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" sideOffset={4}>
							<HotkeyTooltipContent label={label} hotkeyId={hotkeyId} />
						</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}
