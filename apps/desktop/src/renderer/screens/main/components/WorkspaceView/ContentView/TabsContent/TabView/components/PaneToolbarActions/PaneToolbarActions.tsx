import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiMiniXMark } from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import { HotkeyLabel } from "renderer/hotkeys";
import type { SplitOrientation } from "../../hooks";

interface PaneToolbarActionsProps {
	splitOrientation: SplitOrientation;
	onSplitPane: (e: React.MouseEvent) => void;
	onClosePane: (e: React.MouseEvent) => void;
	leadingActions?: React.ReactNode;
}

export function PaneToolbarActions({
	splitOrientation,
	onSplitPane,
	onClosePane,
	leadingActions,
}: PaneToolbarActionsProps) {
	const splitIcon =
		splitOrientation === "vertical" ? (
			<TbLayoutColumns className="size-3.5" />
		) : (
			<TbLayoutRows className="size-3.5" />
		);

	return (
		// The mosaic toolbar is a native drag source, so a press that moves a few
		// pixels starts a pane drag and the click never fires: making this
		// wrapper the nearest draggable and canceling its dragstart keeps such a
		// press a click.
		// biome-ignore lint/a11y/noStaticElementInteractions: propagation shield around the action buttons, not an interactive control
		<div
			className="flex items-center gap-0.5"
			draggable
			onDragStart={(e) => {
				e.preventDefault();
				e.stopPropagation();
			}}
		>
			{leadingActions}
			<Tooltip delayDuration={1000}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onSplitPane}
						onMouseDown={(e) => e.preventDefault()}
						className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						{splitIcon}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<HotkeyLabel label="Split pane" id="SPLIT_AUTO" />
				</TooltipContent>
			</Tooltip>
			<button
				type="button"
				onClick={onClosePane}
				onMouseDown={(e) => e.preventDefault()}
				className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
			>
				<HiMiniXMark className="size-3.5" />
			</button>
		</div>
	);
}
