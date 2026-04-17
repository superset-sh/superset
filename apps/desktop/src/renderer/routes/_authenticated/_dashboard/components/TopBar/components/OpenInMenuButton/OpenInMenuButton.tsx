import type { ExternalApp } from "@superset/local-db";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { memo, useCallback, useMemo } from "react";
import { HiChevronDown } from "react-icons/hi2";
import {
	getAppOption,
	OpenInExternalDropdownItems,
} from "renderer/components/OpenInExternalDropdown";
import { HotkeyLabel, useHotkey, useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useThemeStore } from "renderer/stores";

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
	const activeTheme = useThemeStore((state) => state.activeTheme);
	const utils = electronTrpc.useUtils();
	const { data: defaultApp } = electronTrpc.projects.getDefaultApp.useQuery(
		{ projectId: projectId as string },
		{ enabled: !!projectId, staleTime: 30000 },
	);
	const resolvedApp: ExternalApp = defaultApp ?? "finder";
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
		() => getAppOption(resolvedApp) ?? null,
		[resolvedApp],
	);
	const openInDisplay = useHotkeyDisplay("OPEN_IN_APP");
	const copyPathDisplay = useHotkeyDisplay("COPY_PATH");
	const showOpenInShortcut = openInDisplay.text !== "Unassigned";
	const showCopyPathShortcut = copyPathDisplay.text !== "Unassigned";
	const isLoading = openInApp.isPending || copyPath.isPending;

	const isDark = activeTheme?.type === "dark";

	const handleOpenInEditor = useCallback(() => {
		if (openInApp.isPending || copyPath.isPending) return;
		openInApp.mutate({ path: worktreePath, app: resolvedApp, projectId });
	}, [worktreePath, resolvedApp, projectId, openInApp, copyPath.isPending]);

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

	useHotkey("OPEN_IN_APP", handleOpenInEditor);

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
						)}
					>
						{currentApp && (
							<img
								src={isDark ? currentApp.darkIcon : currentApp.lightIcon}
								alt=""
								className="size-3.5 object-contain shrink-0"
							/>
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
					{currentApp ? (
						<HotkeyLabel
							label={`Open in ${currentApp.displayLabel ?? currentApp.label}`}
							id="OPEN_IN_APP"
						/>
					) : (
						"Select an editor from the dropdown"
					)}
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
					<OpenInExternalDropdownItems
						isDark={isDark}
						activeApp={resolvedApp}
						onOpenIn={handleOpenInOtherApp}
						onCopyPath={handleCopyPath}
						renderAppTrailing={(appId, group) => {
							if (
								appId !== resolvedApp ||
								!showOpenInShortcut ||
								group === "jetbrains"
							) {
								return null;
							}
							return (
								<DropdownMenuShortcut>
									{openInDisplay.text}
								</DropdownMenuShortcut>
							);
						}}
						copyPathTrailing={
							showCopyPathShortcut ? (
								<DropdownMenuShortcut>
									{copyPathDisplay.text}
								</DropdownMenuShortcut>
							) : null
						}
						subContentClassName="w-40"
						appContentClassName="gap-0"
						appIconClassName="size-4 object-contain mr-2"
						subTriggerIconClassName="size-4 object-contain mr-2"
						subTriggerContentClassName="flex items-center gap-0"
						copyPathContentClassName="gap-0"
						copyPathIconClassName="mr-2"
					/>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
});
