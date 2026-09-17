import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { PinIcon } from "lucide-react";
import { track } from "renderer/lib/analytics";
import { usePinnedSidebarCommandsStore } from "renderer/stores/pinned-sidebar-commands";

interface PinCommandButtonProps {
	commandId: string;
}

export function PinCommandButton({ commandId }: PinCommandButtonProps) {
	const { t } = useLingui();
	const isPinned = usePinnedSidebarCommandsStore((state) =>
		state.commandIds.includes(commandId),
	);
	const togglePinned = usePinnedSidebarCommandsStore(
		(state) => state.togglePinned,
	);
	const label = isPinned
		? t({ message: "Unpin from sidebar" })
		: t({ message: "Pin to sidebar" });

	const handleClick = (event: React.MouseEvent) => {
		// The row itself is a click target that runs the command.
		event.stopPropagation();
		togglePinned(commandId);
		track("command_pin_toggled", { commandId, pinned: !isPinned });
	};

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-pressed={isPinned}
					// Keeps focus in the search input so typing continues to filter.
					onMouseDown={(event) => event.preventDefault()}
					onClick={handleClick}
					className={cn(
						"flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-fill-selected hover:text-foreground focus-visible:opacity-100",
						isPinned
							? "opacity-100"
							: "opacity-0 group-data-[selected=true]/command-row:opacity-100",
					)}
				>
					<PinIcon
						className={cn("!size-3.5 text-current", isPinned && "fill-current")}
					/>
				</button>
			</TooltipTrigger>
			<TooltipContent side="left">{label}</TooltipContent>
		</Tooltip>
	);
}
