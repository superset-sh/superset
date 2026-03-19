import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	LuFile,
	LuGitCompareArrows,
	LuPanelLeft,
	LuPanelRight,
	LuX,
} from "react-icons/lu";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type PanelSide,
	RightSidebarTab,
	SidebarMode,
	useSidebarStore,
} from "renderer/stores/sidebar-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { useScrollContext } from "../ChangesContent";
import { ChangesView } from "./ChangesView";
import { FilesView } from "./FilesView";

function TabButton({
	isActive,
	onClick,
	icon,
	label,
	compact,
}: {
	isActive: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
	compact?: boolean;
}) {
	if (compact) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onClick}
						className={cn(
							"flex items-center justify-center shrink-0 h-full w-10 transition-all",
							isActive
								? "text-foreground bg-border/30"
								: "text-muted-foreground/70 hover:text-muted-foreground hover:bg-tertiary/20",
						)}
					>
						{icon}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{label}
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-2 shrink-0 px-3 h-full transition-all text-sm",
				isActive
					? "text-foreground bg-border/30"
					: "text-muted-foreground/70 hover:text-muted-foreground hover:bg-tertiary/20",
			)}
		>
			{icon}
			{label}
		</button>
	);
}

interface RightSidebarProps {
	side?: PanelSide;
}

export function RightSidebar({ side = "right" }: RightSidebarProps) {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;
	const currentMode = useSidebarStore((s) => s.currentMode);
	const rightSidebarTab = useSidebarStore((s) => s.rightSidebarTab);
	const setRightSidebarTab = useSidebarStore((s) => s.setRightSidebarTab);
	const toggleSidebar = useSidebarStore((s) => s.toggleSidebar);
	const setMode = useSidebarStore((s) => s.setMode);
	const setTabPosition = useSidebarStore((s) => s.setTabPosition);
	const tabPositions = useSidebarStore((s) => s.tabPositions);
	const sidebarWidth = useSidebarStore((s) => s.sidebarWidth);
	const leftPanelWidth = useSidebarStore((s) => s.leftPanelWidth);
	const isExpanded = currentMode === SidebarMode.Changes;
	const panelWidth = side === "left" ? leftPanelWidth : sidebarWidth;
	const compactTabs = panelWidth < 250;
	const showChangesTab =
		!!worktreePath && tabPositions[RightSidebarTab.Changes] === side;
	const showFilesTab = tabPositions[RightSidebarTab.Files] === side;
	const oppositeSide: PanelSide = side === "left" ? "right" : "left";

	const handleExpandToggle = () => {
		setMode(isExpanded ? SidebarMode.Tabs : SidebarMode.Changes);
	};

	const handleClosePanel = () => {
		if (side === "right") {
			// Move any lone tab back to right before closing
			const tabsOnRight = Object.entries(tabPositions).filter(
				([, s]) => s === "right",
			);
			if (tabsOnRight.length <= 1) {
				// Reset all tabs to right so nothing is stranded
				setTabPosition(RightSidebarTab.Changes, "right");
				setTabPosition(RightSidebarTab.Files, "right");
			}
			toggleSidebar();
		} else {
			// Left panel: move all tabs on the left back to right, panel disappears
			for (const [tab, tabSide] of Object.entries(tabPositions)) {
				if (tabSide === "left") {
					setTabPosition(tab as RightSidebarTab, "right");
				}
			}
		}
	};

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const trpcUtils = electronTrpc.useUtils();
	const { scrollToFile } = useScrollContext();

	const invalidateFileContent = useCallback(
		(absolutePath: string) => {
			const invalidations: Promise<unknown>[] = [];
			if (workspaceId) {
				invalidations.push(
					trpcUtils.filesystem.readFile.invalidate({
						workspaceId,
						absolutePath,
					}),
				);
			}
			if (worktreePath) {
				invalidations.push(
					trpcUtils.changes.getGitFileContents.invalidate({
						worktreePath,
						absolutePath,
					}),
				);
			}
			Promise.all(invalidations).catch((error) => {
				console.error(
					"[RightSidebar/invalidateFileContent] Failed to invalidate file content queries:",
					{ absolutePath, error },
				);
			});
		},
		[workspaceId, worktreePath, trpcUtils],
	);

	const handleFileOpenPane = useCallback(
		(file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
			if (!workspaceId || !worktreePath) return;
			const absolutePath = toAbsoluteWorkspacePath(worktreePath, file.path);
			addFileViewerPane(workspaceId, {
				filePath: absolutePath,
				diffCategory: category,
				fileStatus: file.status,
				commitHash,
				oldPath: file.oldPath
					? toAbsoluteWorkspacePath(worktreePath, file.oldPath)
					: undefined,
			});
			invalidateFileContent(absolutePath);
		},
		[workspaceId, worktreePath, addFileViewerPane, invalidateFileContent],
	);

	const handleFileScrollTo = useCallback(
		(file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
			scrollToFile(file, category, commitHash, worktreePath);
		},
		[scrollToFile, worktreePath],
	);

	const handleFileOpen =
		workspaceId && worktreePath
			? isExpanded
				? handleFileScrollTo
				: handleFileOpenPane
			: undefined;

	return (
		<aside className="h-full flex flex-col overflow-hidden">
			<div className="flex items-center bg-background shrink-0 h-10 border-b">
				<div className="flex items-center h-full">
					{showChangesTab && (
						<ContextMenu>
							<ContextMenuTrigger asChild>
								<div className="h-full">
									<TabButton
										isActive={rightSidebarTab === RightSidebarTab.Changes}
										onClick={() => setRightSidebarTab(RightSidebarTab.Changes)}
										icon={<LuGitCompareArrows className="size-3.5" />}
										label="Changes"
										compact={compactTabs}
									/>
								</div>
							</ContextMenuTrigger>
							<ContextMenuContent>
								<ContextMenuItem
									onSelect={() =>
										setTabPosition(RightSidebarTab.Changes, oppositeSide)
									}
								>
									{oppositeSide === "left" ? (
										<LuPanelLeft className="size-4 mr-2" />
									) : (
										<LuPanelRight className="size-4 mr-2" />
									)}
									Move to {oppositeSide === "left" ? "Left" : "Right"}
								</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>
					)}
					{showFilesTab && (
						<ContextMenu>
							<ContextMenuTrigger asChild>
								<div className="h-full">
									<TabButton
										isActive={rightSidebarTab === RightSidebarTab.Files}
										onClick={() => setRightSidebarTab(RightSidebarTab.Files)}
										icon={<LuFile className="size-3.5" />}
										label="Files"
										compact={compactTabs}
									/>
								</div>
							</ContextMenuTrigger>
							<ContextMenuContent>
								<ContextMenuItem
									onSelect={() =>
										setTabPosition(RightSidebarTab.Files, oppositeSide)
									}
								>
									{oppositeSide === "left" ? (
										<LuPanelLeft className="size-4 mr-2" />
									) : (
										<LuPanelRight className="size-4 mr-2" />
									)}
									Move to {oppositeSide === "left" ? "Left" : "Right"}
								</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>
					)}
				</div>
				<div className="flex-1" />
				<div className="flex items-center h-10 pr-2 gap-0.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								onClick={handleClosePanel}
								className="size-6 p-0"
							>
								<LuX className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							<HotkeyTooltipContent
								label={side === "left" ? "Close left panel" : "Close sidebar"}
								hotkeyId="TOGGLE_SIDEBAR"
							/>
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
			{showChangesTab && (
				<div
					className={
						rightSidebarTab === RightSidebarTab.Changes
							? "flex-1 min-h-0 flex flex-col overflow-hidden"
							: "hidden"
					}
				>
					<ChangesView
						onFileOpen={handleFileOpen}
						isExpandedView={isExpanded}
						isActive={rightSidebarTab === RightSidebarTab.Changes}
						isExpanded={isExpanded}
						onExpandToggle={handleExpandToggle}
					/>
				</div>
			)}
			{showFilesTab && (
				<div
					className={
						rightSidebarTab === RightSidebarTab.Changes && showChangesTab
							? "hidden"
							: "flex-1 min-h-0 flex flex-col overflow-hidden"
					}
				>
					<FilesView />
				</div>
			)}
		</aside>
	);
}
