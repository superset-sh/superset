import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiMiniXMark } from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import type { HotkeyId } from "renderer/hotkeys";
import { HotkeyLabel } from "renderer/hotkeys";
import type { SplitOrientation } from "../../hooks";

interface PaneToolbarActionsProps {
	splitOrientation: SplitOrientation;
	onSplitPane: (e: React.MouseEvent) => void;
	onClosePane: (e: React.MouseEvent) => void;
	leadingActions?: React.ReactNode;
	/** Hotkey ID to display for the close action. Defaults to CLOSE_PANE. */
	closeHotkeyId?: HotkeyId;
}

export function PaneToolbarActions({
	splitOrientation,
	onSplitPane,
	onClosePane,
	leadingActions,
	closeHotkeyId = "CLOSE_PANE",
}: PaneToolbarActionsProps) {
	const splitIcon =
		splitOrientation === "vertical" ? (
			<TbLayoutColumns className="size-3.5" />
		) : (
			<TbLayoutRows className="size-3.5" />
		);

	return (
		<div className="flex items-center gap-0.5">
			{leadingActions}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onSplitPane}
						className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						{splitIcon}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					<HotkeyLabel label="Split pane" id="SPLIT_AUTO" />
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onClosePane}
						className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						<HiMiniXMark className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					<HotkeyLabel label="Close pane" id={closeHotkeyId} />
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
