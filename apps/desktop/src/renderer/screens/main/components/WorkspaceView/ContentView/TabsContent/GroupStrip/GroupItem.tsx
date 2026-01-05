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
		<div className="group relative flex items-end shrink-0 h-full">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onSelect}
						className={cn(
							"flex items-center gap-1.5 rounded-t-md transition-all w-full shrink-0 pl-3 pr-6 h-[80%]",
							isActive
								? "text-foreground border-t border-l border-r border-border"
								: "text-muted-foreground hover:text-foreground hover:bg-tertiary/30",
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
							"mt-1 absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer size-5 group-hover:opacity-100",
							isActive ? "opacity-90" : "opacity-0",
						)}
						aria-label="Close group"
					>
						<HiMiniXMark />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Close group
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
