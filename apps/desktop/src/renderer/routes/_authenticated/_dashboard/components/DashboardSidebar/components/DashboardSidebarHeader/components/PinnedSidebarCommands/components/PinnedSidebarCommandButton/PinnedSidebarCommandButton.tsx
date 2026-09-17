import { Trans, useLingui } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPin, LuPinOff } from "react-icons/lu";
import type { Command } from "renderer/commandPalette";
import { usePinnedSidebarCommandsStore } from "renderer/stores/pinned-sidebar-commands";

interface PinnedSidebarCommandButtonProps {
	command: Command;
	isCollapsed: boolean;
	onRun: (command: Command) => void;
}

export function PinnedSidebarCommandButton({
	command,
	isCollapsed,
	onRun,
}: PinnedSidebarCommandButtonProps) {
	const { i18n } = useLingui();
	const unpin = usePinnedSidebarCommandsStore((state) => state.unpin);
	const title = i18n._(command.title);
	const Icon = command.icon ?? LuPin;
	const iconSize = isCollapsed ? "size-3.5" : "size-4";
	const icon = command.iconUrl ? (
		<img
			src={command.iconUrl}
			alt=""
			className={`${iconSize} shrink-0 object-contain`}
		/>
	) : (
		<Icon
			className={`${iconSize} shrink-0 stroke-[1.5] text-muted-foreground`}
		/>
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				{isCollapsed ? (
					<div>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => onRun(command)}
									aria-label={title}
									className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover"
								>
									{icon}
								</button>
							</TooltipTrigger>
							<TooltipContent side="right">{title}</TooltipContent>
						</Tooltip>
					</div>
				) : (
					<button
						type="button"
						onClick={() => onRun(command)}
						className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
					>
						{icon}
						<span className="flex-1 truncate text-left">{title}</span>
					</button>
				)}
			</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuItem onSelect={() => unpin(command.id)}>
					<LuPinOff className="size-4 mr-2" />
					<Trans>Unpin from sidebar</Trans>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
