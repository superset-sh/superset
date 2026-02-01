import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import { LuFile, LuGitCompareArrows } from "react-icons/lu";
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

function TabButton({
	isActive,
	onClick,
	children,
	tooltip,
}: {
	isActive: boolean;
	onClick: () => void;
	children: React.ReactNode;
	tooltip: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClick}
					className={`size-6 p-0 ${isActive ? "bg-muted" : ""}`}
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}

function FilesView() {
	return (
		<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
			Files view coming soon
		</div>
	);
}

export function Sidebar() {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;
	const { currentMode, rightSidebarTab, setRightSidebarTab } =
		useSidebarStore();
	const isExpanded = currentMode === SidebarMode.Changes;

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
					"[Sidebar/invalidateFileContent] Failed to invalidate file content queries:",
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
			<div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border">
				<TabButton
					isActive={rightSidebarTab === RightSidebarTab.Changes}
					onClick={() => setRightSidebarTab(RightSidebarTab.Changes)}
					tooltip="Changes"
				>
					<LuGitCompareArrows className="size-3.5" />
				</TabButton>
				<TabButton
					isActive={rightSidebarTab === RightSidebarTab.Files}
					onClick={() => setRightSidebarTab(RightSidebarTab.Files)}
					tooltip="Files"
				>
					<LuFile className="size-3.5" />
				</TabButton>
			</div>
			{rightSidebarTab === RightSidebarTab.Changes ? (
				<ChangesView onFileOpen={handleFileOpen} isExpandedView={isExpanded} />
			) : (
				<FilesView />
			)}
		</aside>
	);
}
