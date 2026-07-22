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
		<div className="flex items-center gap-0.5">
			{leadingActions}
			<Tooltip delayDuration={1000}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onSplitPane}
						className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						{splitIcon}
					</button>
				</TooltipTrigger>
				<TooltipContent
					side="bottom"
					sideOffset={4}
					showArrow={false}
					className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-medium text-muted-foreground shadow-sm"
				>
					<HotkeyLabel label="Split pane" id="SPLIT_AUTO" />
				</TooltipContent>
			</Tooltip>
			<button
				type="button"
				onClick={onClosePane}
				className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
			>
				<HiMiniXMark className="size-3.5" />
			</button>
		</div>
	);
}
