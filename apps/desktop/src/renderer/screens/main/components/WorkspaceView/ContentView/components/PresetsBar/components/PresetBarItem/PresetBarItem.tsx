import type { TerminalPreset } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniCommandLine } from "react-icons/hi2";
import { getPresetIcon } from "renderer/assets/app-icons/preset-icons";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent/HotkeyTooltipContent";
import type { HotkeyId } from "shared/hotkeys";

const PRESET_BAR_ITEM_TYPE = "PRESET_BAR_ITEM";

interface PresetBarItemProps {
	preset: TerminalPreset;
	pinnedIndex: number;
	hotkeyId?: HotkeyId;
	isDark: boolean;
	canOpen: boolean;
	onOpenDefault: (preset: TerminalPreset) => void;
	onOpenInNewTab: (preset: TerminalPreset) => void;
	onOpenInPane: (preset: TerminalPreset) => void;
	onEdit: (preset: TerminalPreset) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (presetId: string, targetPinnedIndex: number) => void;
}

export function PresetBarItem({
	preset,
	pinnedIndex,
	hotkeyId,
	isDark,
	canOpen,
	onOpenDefault,
	onOpenInNewTab,
	onOpenInPane,
	onEdit,
	onLocalReorder,
	onPersistReorder,
}: PresetBarItemProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const icon = getPresetIcon(preset.name, isDark);
	const label = preset.description || preset.name || "default";

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: PRESET_BAR_ITEM_TYPE,
			item: {
				id: preset.id,
				index: pinnedIndex,
				originalIndex: pinnedIndex,
			},
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[preset.id, pinnedIndex],
	);

	const [, drop] = useDrop({
		accept: PRESET_BAR_ITEM_TYPE,
		hover: (item: { id: string; index: number; originalIndex: number }) => {
			if (item.index !== pinnedIndex) {
				onLocalReorder(item.index, pinnedIndex);
				item.index = pinnedIndex;
			}
		},
		drop: (item: { id: string; index: number; originalIndex: number }) => {
			if (item.originalIndex !== item.index) {
				onPersistReorder(item.id, item.index);
			}
		},
	});

	useEffect(() => {
		drag(drop(containerRef));
	}, [drag, drop]);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					ref={containerRef}
					className={isDragging ? "opacity-40" : undefined}
					style={{ cursor: isDragging ? "grabbing" : "grab" }}
				>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 gap-1.5 text-xs shrink-0"
								onClick={() => onOpenDefault(preset)}
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
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem
					disabled={!canOpen}
					onSelect={() => onOpenInPane(preset)}
				>
					Open in current tab
				</ContextMenuItem>
				<ContextMenuItem
					disabled={!canOpen}
					onSelect={() => onOpenInNewTab(preset)}
				>
					Open in new tab
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={() => onEdit(preset)}>
					Edit preset
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
