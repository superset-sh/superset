import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiMiniXMark } from "react-icons/hi2";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { PaneStatus, Tab } from "renderer/stores/tabs/types";
import { getTabDisplayName } from "renderer/stores/tabs/utils";

interface GroupItemProps {
	tab: Tab;
	isActive: boolean;
	status: PaneStatus | null;
	onSelect: () => void;
	onClose: () => void;
}

export function GroupItem({
	tab,
	isActive,
	status,
	onSelect,
	onClose,
}: GroupItemProps) {
	const displayName = getTabDisplayName(tab);

	return (
		<div className="group relative flex items-center shrink-0 h-full border-r border-border">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onSelect}
						className={cn(
							"flex items-center gap-2 transition-all w-full shrink-0 px-3 h-full",
							isActive
								? "text-foreground bg-border/30"
								: "text-muted-foreground/70 hover:text-muted-foreground hover:bg-tertiary/20",
						)}
					>
						<span className="text-sm whitespace-nowrap overflow-hidden flex-1 text-left">
							{displayName}
						</span>
						{status && status !== "idle" && <StatusIndicator status={status} />}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					{displayName}
				</TooltipContent>
			</Tooltip>
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation();
							onClose();
						}}
						className={cn(
							"absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer size-5 bg-muted hover:bg-background",
							isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
						)}
						aria-label="Close group"
					>
						<HiMiniXMark className="size-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Close group
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
