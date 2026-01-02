import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { GoGitBranch } from "react-icons/go";

interface BranchIndicatorProps {
	branch: string | undefined;
}

export function BranchIndicator({ branch }: BranchIndicatorProps) {
	if (!branch) return null;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-1.5 min-w-0 no-drag rounded px-1 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
				>
					<GoGitBranch className="size-3.5 text-foreground/60 shrink-0" />
					<span className="max-w-[140px] truncate text-xs text-foreground/90 font-medium">
						{branch}
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom" sideOffset={8}>
				Current branch
			</TooltipContent>
		</Tooltip>
	);
}
