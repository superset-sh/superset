import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	LuExpand,
	LuFile,
	LuGitCompareArrows,
	LuShrink,
	LuX,
} from "react-icons/lu";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	RightSidebarTab,
	SidebarMode,
	useSidebarStore,
} from "renderer/stores/sidebar-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { useScrollContext } from "../ChangesContent";
import { ChangesView } from "./ChangesView";
import { FilesView } from "./FilesView";

function TabButton({
	isActive,
	onClick,
	icon,
	label,
}: {
	isActive: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
}) {
	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={onClick}
			className={`h-6 px-2 py-0 text-xs gap-1 ${isActive ? "bg-muted" : ""}`}
		>
			{icon}
			{label}
		</Button>
	);
}

export function RightSidebar() {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;
	const {
		currentMode,
		rightSidebarTab,
		setRightSidebarTab,
		toggleSidebar,
		setMode,
	} = useSidebarStore();
	const isExpanded = currentMode === SidebarMode.Changes;
	const showChangesTab = !!worktreePath;

	const handleExpandToggle = () => {
		setMode(isExpanded ? SidebarMode.Tabs : SidebarMode.Changes);
	};

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const trpcUtils = electronTrpc.useUtils();
	const { scrollToFile } = useScrollContext();

	const invalidateFileContent = useCallback(
		(filePath: string) => {
			if (!worktreePath) return;

			Promise.all([
				trpcUtils.changes.readWorkingFile.invalidate({
					worktreePath,
					filePath,
				}),
				trpcUtils.changes.getFileContents.invalidate({
					worktreePath,
					filePath,
				}),
			]).catch((error) => {
				console.error(
					"[RightSidebar/invalidateFileContent] Failed to invalidate file content queries:",
					{ worktreePath, filePath, error },
				);
			});
		},
		[worktreePath, trpcUtils],
	);

	const handleFileOpenPane = useCallback(
		(file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
			if (!workspaceId || !worktreePath) return;
			addFileViewerPane(workspaceId, {
				filePath: file.path,
				diffCategory: category,
				commitHash,
				oldPath: file.oldPath,
			});
			invalidateFileContent(file.path);
		},
		[workspaceId, worktreePath, addFileViewerPane, invalidateFileContent],
	);

	const handleFileScrollTo = useCallback(
		(file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
			scrollToFile(file, category, commitHash);
		},
		[scrollToFile],
	);

	const handleFileOpen =
		workspaceId && worktreePath
			? isExpanded
				? handleFileScrollTo
				: handleFileOpenPane
			: undefined;

	return (
		<aside className="h-full flex flex-col overflow-hidden">
			<div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-border">
				{showChangesTab && (
					<TabButton
						isActive={rightSidebarTab === RightSidebarTab.Changes}
						onClick={() => setRightSidebarTab(RightSidebarTab.Changes)}
						icon={<LuGitCompareArrows className="size-3.5" />}
						label="Changes"
					/>
				)}
				<TabButton
					isActive={rightSidebarTab === RightSidebarTab.Files}
					onClick={() => setRightSidebarTab(RightSidebarTab.Files)}
					icon={<LuFile className="size-3.5" />}
					label="Files"
				/>
				<div className="flex-1" />
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={handleExpandToggle}
							className="size-6 p-0"
						>
							{isExpanded ? (
								<LuShrink className="size-3.5" />
							) : (
								<LuExpand className="size-3.5" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						<HotkeyTooltipContent
							label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
							hotkeyId="TOGGLE_EXPAND_SIDEBAR"
						/>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={toggleSidebar}
							className="size-6 p-0"
						>
							<LuX className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						<HotkeyTooltipContent
							label="Close sidebar"
							hotkeyId="TOGGLE_SIDEBAR"
						/>
					</TooltipContent>
				</Tooltip>
			</div>
			{rightSidebarTab === RightSidebarTab.Changes && showChangesTab ? (
				<ChangesView onFileOpen={handleFileOpen} isExpandedView={isExpanded} />
			) : (
				<FilesView />
			)}
		</aside>
	);
}
