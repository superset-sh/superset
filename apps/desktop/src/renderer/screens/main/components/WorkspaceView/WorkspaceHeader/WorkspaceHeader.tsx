import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { GoGitBranch } from "react-icons/go";
import { getAppOption } from "renderer/components/OpenInButton";
import { trpc } from "renderer/lib/trpc";
import { OpenInMenu } from "./components/OpenInMenu";

interface WorkspaceHeaderProps {
	worktreePath: string | undefined;
}

export function WorkspaceHeader({ worktreePath }: WorkspaceHeaderProps) {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const currentBranch = activeWorkspace?.worktree?.branch;
	const baseBranch = activeWorkspace?.worktree?.baseBranch;

	const { data: lastUsedApp = "cursor" } =
		trpc.settings.getLastUsedApp.useQuery();
	const openInApp = trpc.external.openInApp.useMutation();

	const currentApp = getAppOption(lastUsedApp);

	const handleOpenInEditor = () => {
		if (!worktreePath) return;
		openInApp.mutate({ path: worktreePath, app: lastUsedApp });
	};

	if (!worktreePath) return null;

	return (
		<div className="h-8 w-full flex items-center justify-between px-3 border-t border-border/50 bg-muted/40 text-[11px] shrink-0 select-none">
			{/* Left side - Branch info (read-only) */}
			<div className="flex items-center gap-2">
				{currentBranch && (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="flex items-center gap-1.5">
								<GoGitBranch className="size-3.5 text-foreground/60" />
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
								<span>from</span>
								<span className="text-foreground/70">{baseBranch}</span>
							</span>
						</TooltipTrigger>
						<TooltipContent side="top" sideOffset={8}>
							Based on {baseBranch}
						</TooltipContent>
					</Tooltip>
				)}
			</div>

			{/* Right side - Path and Open In */}
			<div className="flex items-center gap-3">
				{/* Path display - full path */}
				<span className="truncate text-foreground/50 font-mono text-[10px]">
					{worktreePath}
				</span>

				{/* Open in editor - primary action */}
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleOpenInEditor}
							className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/90 hover:bg-primary text-primary-foreground shadow-sm transition-all hover:shadow"
						>
							<img
								src={currentApp.icon}
								alt={currentApp.label}
								className="size-3.5 object-contain"
							/>
							<span className="text-[11px] font-medium">Open</span>
						</button>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={8}>
						Open in {currentApp.label} (⌘O)
					</TooltipContent>
				</Tooltip>

				{/* More options dropdown */}
				<OpenInMenu path={worktreePath} />
			</div>
		</div>
	);
}
