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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	LuFile,
	LuGitCompareArrows,
	LuPanelLeft,
	LuPanelRight,
	LuX,
} from "react-icons/lu";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { useProjectFocus } from "renderer/hooks/useProjectFocus";
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
import { ProjectSection } from "../../WorkspaceSidebar/ProjectSection";
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
	const projectFocusPosition = useSidebarStore((s) => s.projectFocusPosition);
	const setProjectFocusPosition = useSidebarStore(
		(s) => s.setProjectFocusPosition,
	);
	const isExpanded = currentMode === SidebarMode.Changes;
	const panelWidth = side === "left" ? leftPanelWidth : sidebarWidth;
	const compactTabs = panelWidth < 250;
	const showChangesTab =
		!!worktreePath && tabPositions[RightSidebarTab.Changes] === side;
	const showFilesTab = tabPositions[RightSidebarTab.Files] === side;
	const oppositeSide: PanelSide = side === "left" ? "right" : "left";
	// When only one tab is on this side, it's always active — no need to check rightSidebarTab
	const isOnlyTabOnSide = Number(showChangesTab) + Number(showFilesTab) === 1;

	// Project focus bar — render in the sidebar that matches its position
	const projectFocusId = useProjectFocus();
	const { data: allGroups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const focusGroup = useMemo(
		() =>
			projectFocusId
				? allGroups.find((g) => g.project.id === projectFocusId)
				: undefined,
		[allGroups, projectFocusId],
	);
	const showProjectFocus =
		!!projectFocusId && !!focusGroup && projectFocusPosition === side;

	// Vertical resize for project focus section
	const projectFocusHeight = useSidebarStore((s) => s.projectFocusHeight);
	const setProjectFocusHeight = useSidebarStore((s) => s.setProjectFocusHeight);
	const focusResizeRef = useRef<{
		startY: number;
		startHeight: number;
	} | null>(null);
	const focusContentRef = useRef<HTMLDivElement>(null);
	const [isFocusResizing, setIsFocusResizing] = useState(false);

	const handleFocusResizeMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			const currentHeight =
				projectFocusHeight > 0
					? projectFocusHeight
					: (focusContentRef.current?.scrollHeight ?? 0);
			focusResizeRef.current = {
				startY: e.clientY,
				startHeight: currentHeight,
			};
			setIsFocusResizing(true);
		},
		[projectFocusHeight],
	);

	useEffect(() => {
		if (!isFocusResizing) return;

		const MIN_FOCUS_HEIGHT = 40;

		const handleMouseMove = (e: MouseEvent) => {
			if (!focusResizeRef.current) return;
			const delta = e.clientY - focusResizeRef.current.startY;
			const newHeight = Math.max(
				MIN_FOCUS_HEIGHT,
				focusResizeRef.current.startHeight + delta,
			);
			setProjectFocusHeight(newHeight);
		};

		const handleMouseUp = () => {
			focusResizeRef.current = null;
			setIsFocusResizing(false);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		document.body.style.userSelect = "none";
		document.body.style.cursor = "row-resize";

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
		};
	}, [isFocusResizing, setProjectFocusHeight]);

	const handleExpandToggle = () => {
		setMode(isExpanded ? SidebarMode.Tabs : SidebarMode.Changes);
	};

	const handleClosePanel = () => {
		if (side === "right") {
			const leftHasFocus = !!projectFocusId && projectFocusPosition === "left";

			if (leftHasFocus) {
				// Left panel has the ProjectFocusBar — keep it open.
				// Move right tabs to left so they join the focus bar panel.
				for (const [tab, tabSide] of Object.entries(tabPositions)) {
					if (tabSide === "right") {
						setTabPosition(tab as RightSidebarTab, "left");
					}
				}
			} else {
				// No left focus bar — normal close behavior
				const tabsOnRight = Object.entries(tabPositions).filter(
					([, s]) => s === "right",
				);
				if (tabsOnRight.length <= 1) {
					setTabPosition(RightSidebarTab.Changes, "right");
					setTabPosition(RightSidebarTab.Files, "right");
				}
				toggleSidebar();
			}
		} else {
			// Left panel: move all tabs on the left back to right, panel disappears.
			// Project focus bar stays put — it'll reappear when the sidebar is reopened.
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
			{showProjectFocus && focusGroup && (
				<div className="relative shrink-0">
					<div
						ref={focusContentRef}
						className="overflow-y-auto"
						style={
							projectFocusHeight > 0
								? { height: projectFocusHeight }
								: undefined
						}
					>
						<ProjectSection
							projectId={focusGroup.project.id}
							projectName={focusGroup.project.name}
							projectColor={focusGroup.project.color}
							githubOwner={focusGroup.project.githubOwner}
							mainRepoPath={focusGroup.project.mainRepoPath}
							hideImage={focusGroup.project.hideImage}
							iconUrl={focusGroup.project.iconUrl}
							worktreeMode={focusGroup.project.worktreeMode}
							workspaces={focusGroup.workspaces}
							sections={focusGroup.sections ?? []}
							topLevelItems={focusGroup.topLevelItems}
							shortcutBaseIndex={0}
							index={0}
							hideOpenInFocusWindow
							extraContextMenuItems={
								<ContextMenuItem
									onSelect={() => setProjectFocusPosition(oppositeSide)}
								>
									{oppositeSide === "left" ? (
										<LuPanelLeft className="size-4 mr-2" />
									) : (
										<LuPanelRight className="size-4 mr-2" />
									)}
									Move to {oppositeSide === "left" ? "Left" : "Right"}
								</ContextMenuItem>
							}
						/>
					</div>
					{/* Vertical resize handle */}
					{/* biome-ignore lint/a11y/useSemanticElements: interactive resize handle */}
					<div
						role="separator"
						aria-orientation="horizontal"
						aria-valuenow={projectFocusHeight}
						tabIndex={0}
						onMouseDown={handleFocusResizeMouseDown}
						onDoubleClick={() => setProjectFocusHeight(0)}
						className={cn(
							"absolute bottom-0 left-0 right-0 h-3 cursor-row-resize z-10 -mb-1.5",
							"after:absolute after:bottom-1 after:left-0 after:right-0 after:h-px after:transition-colors",
							"hover:after:bg-border focus:outline-none focus:after:bg-border",
							isFocusResizing && "after:bg-border",
						)}
					/>
				</div>
			)}
			<div className="flex items-center bg-background shrink-0 h-10 border-b">
				<div className="flex items-center h-full">
					{showChangesTab && (
						<ContextMenu>
							<ContextMenuTrigger asChild>
								<div className="h-full">
									<TabButton
										isActive={
											isOnlyTabOnSide ||
											rightSidebarTab === RightSidebarTab.Changes
										}
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
										isActive={
											isOnlyTabOnSide ||
											rightSidebarTab === RightSidebarTab.Files
										}
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
						isOnlyTabOnSide || rightSidebarTab === RightSidebarTab.Changes
							? "flex-1 min-h-0 flex flex-col overflow-hidden"
							: "hidden"
					}
				>
					<ChangesView
						onFileOpen={handleFileOpen}
						isExpandedView={isExpanded}
						isActive={
							isOnlyTabOnSide || rightSidebarTab === RightSidebarTab.Changes
						}
						isExpanded={isExpanded}
						onExpandToggle={handleExpandToggle}
					/>
				</div>
			)}
			{showFilesTab && (
				<div
					className={
						!isOnlyTabOnSide &&
						rightSidebarTab === RightSidebarTab.Changes &&
						showChangesTab
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
