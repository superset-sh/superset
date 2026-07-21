import type { ExternalApp } from "@superset/local-db";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { OverflowFadeText } from "@superset/ui/overflow-fade-text";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useCallback, useMemo } from "react";
import { VscChevronDown } from "react-icons/vsc";
import {
	getAppOption,
	OpenInExternalDropdownItems,
} from "renderer/components/OpenInExternalDropdown";
import { HotkeyLabel, useHotkey, useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useV2ProjectDefaultApp } from "renderer/routes/_authenticated/hooks/useV2ProjectDefaultApp";
import { useThemeStore } from "renderer/stores";

interface V2OpenInMenuButtonProps {
	worktreePath: string;
	branch: string;
	projectId: string;
}

export function V2OpenInMenuButton({
	worktreePath,
	branch,
	projectId,
}: V2OpenInMenuButtonProps) {
	const activeTheme = useThemeStore((state) => state.activeTheme);

	const { app: persistedApp, setApp: persistDefaultApp } =
		useV2ProjectDefaultApp(projectId);
	const resolvedApp: ExternalApp = persistedApp ?? "finder";

	const openInApp = electronTrpc.external.openInApp.useMutation({
		onSuccess: (_data, variables) => {
			persistDefaultApp(variables.app);
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
		openInApp.mutate({ path: worktreePath, app: resolvedApp });
	}, [worktreePath, resolvedApp, openInApp, copyPath.isPending]);

	const handleOpenInOtherApp = useCallback(
		(appId: ExternalApp) => {
			if (openInApp.isPending || copyPath.isPending) return;
			openInApp.mutate({ path: worktreePath, app: appId });
		},
		[worktreePath, openInApp, copyPath.isPending],
	);

	const handleCopyPath = useCallback(() => {
		if (openInApp.isPending || copyPath.isPending) return;
		copyPath.mutate(worktreePath);
	}, [worktreePath, copyPath, openInApp.isPending]);

	useHotkey("OPEN_IN_APP", handleOpenInEditor);

	return (
		<div className="flex items-center no-drag">
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
							// Icon-only when the nearest @container is narrow; the branch
							// label comes back once there's room (right sidebar is resizable,
							// so viewport breakpoints don't apply here).
							"group flex h-6 items-center justify-center gap-1.5 rounded-l border border-r-0 border-border/60 bg-secondary/50 px-1.5 text-xs font-medium @[240px]:pr-2",
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
							<OverflowFadeText
								className="hidden max-w-[140px] text-muted-foreground tabular-nums @[240px]:inline-block"
								title={branch}
							>
								/{branch}
							</OverflowFadeText>
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6}>
					{currentApp ? (
						<div className="flex flex-col gap-0.5">
							<HotkeyLabel
								label={`Open in ${currentApp.displayLabel ?? currentApp.label}`}
								id="OPEN_IN_APP"
							/>
							<span className="text-muted-foreground">{worktreePath}</span>
						</div>
					) : (
						"Select an editor from the dropdown"
					)}
				</TooltipContent>
			</Tooltip>

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
						<VscChevronDown className="size-3" />
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
}
