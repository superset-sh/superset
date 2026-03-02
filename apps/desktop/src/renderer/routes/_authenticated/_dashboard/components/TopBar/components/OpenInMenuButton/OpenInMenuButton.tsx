import type { ExternalApp } from "@superset/local-db";
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
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { memo, useCallback, useMemo } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { LuCopy, LuExternalLink } from "react-icons/lu";
import jetbrainsIcon from "renderer/assets/app-icons/jetbrains.svg";
import vscodeIcon from "renderer/assets/app-icons/vscode.svg";
import {
	APP_OPTIONS,
	getAppOption,
	JETBRAINS_OPTIONS,
	VSCODE_OPTIONS,
} from "renderer/components/OpenInButton";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useHotkeyText } from "renderer/stores/hotkeys";

interface OpenInMenuButtonProps {
	worktreePath: string;
	branch?: string;
	projectId?: string;
}

export const OpenInMenuButton = memo(function OpenInMenuButton({
	worktreePath,
	branch,
	projectId,
}: OpenInMenuButtonProps) {
	const utils = electronTrpc.useUtils();
	const { data: defaultApp } = electronTrpc.projects.getDefaultApp.useQuery(
		{ projectId: projectId as string },
		{ enabled: !!projectId, staleTime: 30000 },
	);
	const openInApp = electronTrpc.external.openInApp.useMutation({
		onSuccess: () => {
			if (projectId) {
				utils.projects.getDefaultApp.invalidate({ projectId });
			}
		},
		onError: (error) => toast.error(`Failed to open: ${error.message}`),
	});
	const copyPath = electronTrpc.external.copyPath.useMutation({
		onSuccess: () => toast.success("Path copied to clipboard"),
		onError: (error) => toast.error(`Failed to copy path: ${error.message}`),
	});

	const currentApp = useMemo(
		() => (defaultApp ? (getAppOption(defaultApp) ?? null) : null),
		[defaultApp],
	);
	const openInShortcut = useHotkeyText("OPEN_IN_APP");
	const copyPathShortcut = useHotkeyText("COPY_PATH");
	const showOpenInShortcut = openInShortcut !== "Unassigned";
	const showCopyPathShortcut = copyPathShortcut !== "Unassigned";
	const isLoading = openInApp.isPending || copyPath.isPending;

	const handleOpenInEditor = useCallback(() => {
		if (openInApp.isPending || copyPath.isPending) return;
		if (!defaultApp) {
			toast.error("No default editor configured", {
				description: "Open a project in an editor first to set a default.",
			});
			return;
		}
		openInApp.mutate({ path: worktreePath, app: defaultApp, projectId });
	}, [worktreePath, defaultApp, projectId, openInApp, copyPath.isPending]);

	const handleOpenInOtherApp = useCallback(
		(appId: ExternalApp) => {
			if (openInApp.isPending || copyPath.isPending) return;
			openInApp.mutate({ path: worktreePath, app: appId, projectId });
		},
		[worktreePath, projectId, openInApp, copyPath.isPending],
	);

	const handleCopyPath = useCallback(() => {
		if (openInApp.isPending || copyPath.isPending) return;
		copyPath.mutate(worktreePath);
	}, [worktreePath, copyPath, openInApp.isPending]);

	return (
		<div className="flex items-center no-drag">
			{/* Main button - opens in last used app */}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleOpenInEditor}
						disabled={isLoading || !currentApp}
						aria-label={
							currentApp
								? `Open in ${currentApp.displayLabel ?? currentApp.label}`
								: "Open in editor"
						}
						className={cn(
							"group flex items-center gap-1.5 h-6 px-1.5 sm:pl-1.5 sm:pr-2 rounded-l border border-r-0 border-border/60 bg-secondary/50 text-xs font-medium",
							"transition-all duration-150 ease-out",
							"hover:bg-secondary hover:border-border",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							"active:scale-[0.98]",
							isLoading && "opacity-50 pointer-events-none",
							!currentApp && "opacity-50",
						)}
					>
						{currentApp ? (
							<img
								src={currentApp.icon}
								alt=""
								className="size-3.5 object-contain shrink-0"
							/>
						) : (
							<LuExternalLink className="size-3.5 shrink-0" />
						)}
						{branch && (
							<span className="hidden lg:inline text-muted-foreground truncate max-w-[140px] tabular-nums">
								/{branch}
							</span>
						)}
						<span className="hidden sm:inline text-foreground font-medium">
							Open
						</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6}>
					<div className="flex flex-col gap-1">
						<span className="flex items-center gap-1.5">
							{currentApp
								? `Open in ${currentApp.displayLabel ?? currentApp.label}`
								: "Select an editor from the dropdown"}
							{currentApp && showOpenInShortcut && (
								<kbd className="px-1 py-0.5 text-[10px] font-mono bg-foreground/10 text-foreground/70 rounded">
									{openInShortcut}
								</kbd>
							)}
						</span>
						{branch && (
							<span className="text-xs text-muted-foreground font-mono">
								/{branch}
							</span>
						)}
					</div>
				</TooltipContent>
			</Tooltip>

			{/* Dropdown trigger */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={isLoading}
						className={cn(
							"flex items-center justify-center h-6 w-6 rounded-r border border-border/60 bg-secondary/50 text-muted-foreground",
							"transition-all duration-150 ease-out",
							"hover:bg-secondary hover:border-border hover:text-foreground",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							"active:scale-[0.98]",
							isLoading && "opacity-50 pointer-events-none",
						)}
					>
						<HiChevronDown className="size-3.5" />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-48">
					{APP_OPTIONS.map((app) => (
						<DropdownMenuItem
							key={app.id}
							onClick={() => handleOpenInOtherApp(app.id)}
						>
							<img
								src={app.icon}
								alt=""
								className="size-4 object-contain mr-2"
							/>
							{app.label}
							{app.id === defaultApp && showOpenInShortcut && (
								<DropdownMenuShortcut>{openInShortcut}</DropdownMenuShortcut>
							)}
						</DropdownMenuItem>
					))}
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<img
								src={vscodeIcon}
								alt=""
								className="size-4 object-contain mr-2"
							/>
							VS Code
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-40">
							{VSCODE_OPTIONS.map((app) => (
								<DropdownMenuItem
									key={app.id}
									onClick={() => handleOpenInOtherApp(app.id)}
								>
									<img
										src={app.icon}
										alt=""
										className="size-4 object-contain mr-2"
									/>
									{app.label}
									{app.id === defaultApp && showOpenInShortcut && (
										<DropdownMenuShortcut>
											{openInShortcut}
										</DropdownMenuShortcut>
									)}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<img
								src={jetbrainsIcon}
								alt=""
								className="size-4 object-contain mr-2"
							/>
							JetBrains
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-40">
							{JETBRAINS_OPTIONS.map((app) => (
								<DropdownMenuItem
									key={app.id}
									onClick={() => handleOpenInOtherApp(app.id)}
								>
									<img
										src={app.icon}
										alt=""
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
						{showCopyPathShortcut && (
							<DropdownMenuShortcut>{copyPathShortcut}</DropdownMenuShortcut>
						)}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
});
