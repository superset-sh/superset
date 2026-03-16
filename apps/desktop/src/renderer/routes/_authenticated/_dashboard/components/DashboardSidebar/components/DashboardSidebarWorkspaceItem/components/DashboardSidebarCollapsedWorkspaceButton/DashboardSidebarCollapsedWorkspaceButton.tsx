import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { GoGitBranch } from "react-icons/go";

interface DashboardSidebarCollapsedWorkspaceButtonProps {
	name: string;
	branch: string;
	isActive: boolean;
	isDragging: boolean;
	onClick: () => void;
	setDragHandle: (node: HTMLButtonElement | null) => void;
}

export function DashboardSidebarCollapsedWorkspaceButton({
	name,
	branch,
	isActive,
	isDragging,
	onClick,
	setDragHandle,
}: DashboardSidebarCollapsedWorkspaceButtonProps) {
	const showBranch = !!name && name !== branch;

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					ref={setDragHandle}
					onClick={onClick}
					className={cn(
						"relative flex items-center justify-center size-8 rounded-md",
						"hover:bg-muted/50 transition-colors cursor-pointer",
						isActive && "bg-muted",
						isDragging && "opacity-30",
					)}
				>
					<GoGitBranch
						className={cn(
							"size-4",
							isActive ? "text-foreground" : "text-muted-foreground",
						)}
					/>
				</button>
			</TooltipTrigger>
			<TooltipContent side="right" className="flex flex-col gap-0.5">
				<span className="font-medium">{name || branch}</span>
				{showBranch && (
					<span className="text-xs text-muted-foreground font-mono">
						{branch}
					</span>
				)}
			</TooltipContent>
		</Tooltip>
	);
}
