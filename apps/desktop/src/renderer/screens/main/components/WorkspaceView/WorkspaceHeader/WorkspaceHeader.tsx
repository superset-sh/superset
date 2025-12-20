import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { GoGitBranch } from "react-icons/go";
import { getAppOption } from "renderer/components/OpenInButton";
import { shortenHomePath } from "renderer/lib/formatPath";
import { trpc } from "renderer/lib/trpc";
import { OpenInMenu } from "./components/OpenInMenu";

interface WorkspaceHeaderProps {
	worktreePath: string | undefined;
}

export function WorkspaceHeader({ worktreePath }: WorkspaceHeaderProps) {
	const { data: homeDir } = trpc.window.getHomeDir.useQuery();
	const displayPath = worktreePath
		? shortenHomePath(worktreePath, homeDir)
		: null;

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
		<div className="h-8 w-full flex items-center justify-between px-3 border-t border-border/40 bg-muted/30 text-[11px] text-muted-foreground shrink-0 select-none">
			{/* Left side - Branch info (read-only) */}
			<div className="flex items-center gap-2">
				{currentBranch && (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="flex items-center gap-1.5">
								<GoGitBranch className="size-3.5 text-muted-foreground" />
								<span className="max-w-[150px] truncate text-foreground/80">{currentBranch}</span>
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
							<span className="flex items-center gap-1 text-muted-foreground">
								<span>from</span>
								<span className="text-foreground/60">{baseBranch}</span>
							</span>
						</TooltipTrigger>
						<TooltipContent side="top" sideOffset={8}>
							Based on {baseBranch}
						</TooltipContent>
					</Tooltip>
				)}
			</div>

			{/* Right side - Path and Open In */}
			<div className="flex items-center gap-2">
				{/* Path display */}
				<span className="max-w-[200px] truncate text-muted-foreground/70">
					{displayPath}
				</span>

				{/* Open in editor - primary action */}
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleOpenInEditor}
							className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/80 hover:bg-secondary text-foreground transition-colors"
						>
							<img
								src={currentApp.icon}
								alt={currentApp.label}
								className="size-4 object-contain"
							/>
							<span className="text-xs font-medium">Open</span>
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
