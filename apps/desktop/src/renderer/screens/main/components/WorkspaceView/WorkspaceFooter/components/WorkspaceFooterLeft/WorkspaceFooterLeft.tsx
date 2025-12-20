import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { GoGitBranch } from "react-icons/go";
import { trpc } from "renderer/lib/trpc";
import { HelpMenu } from "../../../../HelpMenu";

export function WorkspaceFooterLeft() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const currentBranch = activeWorkspace?.worktree?.branch;
	const baseBranch = activeWorkspace?.worktree?.baseBranch;
	return (
		<>
			<HelpMenu />
			{currentBranch && (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="flex items-center gap-1.5 min-w-0">
							<GoGitBranch className="size-3.5 text-foreground/60 shrink-0" />
							<span className="max-w-[180px] truncate text-foreground/90 font-medium">
								{currentBranch}
							</span>
						</span>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={8}>
						Current branch
					</TooltipContent>
				</Tooltip>
			)}
			{baseBranch && baseBranch !== currentBranch && (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="flex items-center gap-1.5 text-foreground/50">
							<span className="shrink-0">from</span>
							<span className="text-foreground/70 truncate">{baseBranch}</span>
						</span>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={8}>
						Based on {baseBranch}
					</TooltipContent>
				</Tooltip>
			)}
		</>
	);
}
