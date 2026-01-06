import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiMiniXMark } from "react-icons/hi2";
import type { Tab } from "renderer/stores/tabs/types";
import { getTabDisplayName } from "renderer/stores/tabs/utils";

interface GroupItemProps {
	tab: Tab;
	isActive: boolean;
	needsAttention: boolean;
	onSelect: () => void;
	onClose: () => void;
}

export function GroupItem({
	tab,
	isActive,
	needsAttention,
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
						{needsAttention && (
							<span className="relative flex size-2 shrink-0">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
								<span className="relative inline-flex size-2 rounded-full bg-red-500" />
							</span>
						)}
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
							"absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer size-5 group-hover:opacity-100",
							isActive ? "opacity-90" : "opacity-0",
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
