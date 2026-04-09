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
import type { HotkeyId } from "renderer/hotkeys";
import { HotkeyLabel } from "renderer/hotkeys";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

const V2_PRESET_BAR_ITEM_TYPE = "V2_PRESET_BAR_ITEM";

interface V2PresetBarItemProps {
	preset: V2TerminalPresetRow;
	pinnedIndex: number;
	hotkeyId?: HotkeyId;
	isDark: boolean;
	onOpenInNewTab: (preset: V2TerminalPresetRow) => void;
	onEdit: (preset: V2TerminalPresetRow) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (presetId: string, targetPinnedIndex: number) => void;
}

export function V2PresetBarItem({
	preset,
	pinnedIndex,
	hotkeyId,
	isDark,
	onOpenInNewTab,
	onEdit,
	onLocalReorder,
	onPersistReorder,
}: V2PresetBarItemProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const icon = getPresetIcon(preset.name, isDark);
	const label = preset.description || preset.name || "default";

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: V2_PRESET_BAR_ITEM_TYPE,
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
		accept: V2_PRESET_BAR_ITEM_TYPE,
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
								onClick={() => onOpenInNewTab(preset)}
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
							<HotkeyLabel label={label} id={hotkeyId} />
						</TooltipContent>
					</Tooltip>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={() => onOpenInNewTab(preset)}>
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
