import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiMiniXMark } from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
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
			<TbLayoutColumns className="size-4" />
		) : (
			<TbLayoutRows className="size-4" />
		);

	return (
		<div className="flex items-center gap-0.5">
			{leadingActions}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onSplitPane}
						className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
					>
						{splitIcon}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					<HotkeyTooltipContent label="Split pane" hotkeyId="SPLIT_AUTO" />
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onClosePane}
						className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
					>
						<HiMiniXMark className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					<HotkeyTooltipContent label="Close pane" hotkeyId="CLOSE_TERMINAL" />
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
