import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { GoGitBranch } from "react-icons/go";
import { HiChevronDown } from "react-icons/hi2";
import { LuArrowUpRight, LuCopy } from "react-icons/lu";
import jetbrainsIcon from "renderer/assets/app-icons/jetbrains.svg";
import {
	APP_OPTIONS,
	getAppOption,
	JETBRAINS_OPTIONS,
} from "renderer/components/OpenInButton";
import { trpc } from "renderer/lib/trpc";

interface WorkspaceHeaderProps {
	worktreePath: string | undefined;
}

interface FormattedPath {
	prefix: string;
	worktreeName: string;
}

function formatWorktreePath(
	path: string,
	homeDir: string | undefined,
): FormattedPath {
	// Replace home directory with ~
	let displayPath = path;
	if (homeDir && path.startsWith(homeDir)) {
		displayPath = `~${path.slice(homeDir.length)}`;
	}

	// Find the .superset/worktrees part and show from there
	const worktreesIndex = displayPath.indexOf(".superset/worktrees");
	if (worktreesIndex !== -1) {
		// Include the ~ prefix
		displayPath = `~/${displayPath.slice(worktreesIndex)}`;
	}

	// Split into prefix and worktree name (last segment)
	const lastSlashIndex = displayPath.lastIndexOf("/");
	if (lastSlashIndex !== -1) {
		return {
			prefix: displayPath.slice(0, lastSlashIndex + 1),
			worktreeName: displayPath.slice(lastSlashIndex + 1),
		};
	}

	return { prefix: "", worktreeName: displayPath };
}

export function WorkspaceHeader({ worktreePath }: WorkspaceHeaderProps) {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const currentBranch = activeWorkspace?.worktree?.branch;
	const baseBranch = activeWorkspace?.worktree?.baseBranch;

	const { data: homeDir } = trpc.window.getHomeDir.useQuery();
	const utils = trpc.useUtils();
	const { data: lastUsedApp = "cursor" } =
		trpc.settings.getLastUsedApp.useQuery();
	const openInApp = trpc.external.openInApp.useMutation({
		onSuccess: () => utils.settings.getLastUsedApp.invalidate(),
	});
	const copyPath = trpc.external.copyPath.useMutation();

	const currentApp = getAppOption(lastUsedApp);
	const formattedPath = worktreePath
		? formatWorktreePath(worktreePath, homeDir)
		: null;

	const handleOpenInEditor = () => {
		if (!worktreePath) return;
		openInApp.mutate({ path: worktreePath, app: lastUsedApp });
	};

	const handleOpenInOtherApp = (appId: typeof lastUsedApp) => {
		if (!worktreePath) return;
		openInApp.mutate({ path: worktreePath, app: appId });
	};

	const handleCopyPath = () => {
		if (!worktreePath) return;
		copyPath.mutate(worktreePath);
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

			{/* Right side - Path and Open button (connected) */}
			<div className="flex items-center">
				{/* Path - clickable to open */}
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleOpenInEditor}
							className="group flex items-center gap-1.5 h-[22px] pl-2 pr-1 rounded-l border border-r-0 border-foreground/20 bg-foreground/[0.05] hover:bg-foreground/[0.1] text-[11px] leading-none font-mono font-medium truncate max-w-[480px] transition-colors"
						>
							<img
								src={currentApp.icon}
								alt={currentApp.label}
								className="size-3.5 object-contain shrink-0"
							/>
							<span className="text-foreground/60 group-hover:text-foreground/80 transition-colors">
								{formattedPath?.prefix}
							</span>
							<span className="text-foreground font-semibold">
								{formattedPath?.worktreeName}
							</span>
							<LuArrowUpRight className="size-3 -translate-y-px opacity-0 group-hover:opacity-70 transition-opacity text-foreground/80 shrink-0" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={8}>
						<span className="flex items-center gap-1.5">
							Open in {currentApp.label}
							<kbd className="px-1.5 py-0.5 text-[10px] font-sans bg-foreground/10 rounded">
								⌘O
							</kbd>
						</span>
					</TooltipContent>
				</Tooltip>

				{/* Open dropdown button */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="flex items-center gap-1 h-[22px] px-2 rounded-r border border-foreground/20 bg-foreground/[0.05] hover:bg-foreground/[0.1] text-foreground/90 transition-colors"
						>
							<span className="text-[11px] text-foreground font-semibold">
								Open
							</span>
							<HiChevronDown className="size-3 text-foreground/60" />
						</button>
					</DropdownMenuTrigger>

					<DropdownMenuContent align="end" className="w-52">
						{APP_OPTIONS.map((app) => (
							<DropdownMenuItem
								key={app.id}
								onClick={() => handleOpenInOtherApp(app.id)}
							>
								<img
									src={app.icon}
									alt={app.label}
									className="size-4 object-contain mr-2"
								/>
								{app.label}
								{app.id === lastUsedApp && (
									<DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
								)}
							</DropdownMenuItem>
						))}
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<img
									src={jetbrainsIcon}
									alt="JetBrains"
									className="size-4 object-contain mr-2"
								/>
								JetBrains
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent className="w-44">
								{JETBRAINS_OPTIONS.map((app) => (
									<DropdownMenuItem
										key={app.id}
										onClick={() => handleOpenInOtherApp(app.id)}
									>
										<img
											src={app.icon}
											alt={app.label}
											className="size-4 object-contain mr-2"
										/>
										{app.label}
									</DropdownMenuItem>
								))}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={handleCopyPath}>
							<LuCopy className="size-4 mr-2" />
							Copy path
							<DropdownMenuShortcut>⌘⇧C</DropdownMenuShortcut>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
