import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import { LuDiff } from "react-icons/lu";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { useFileOpenMode } from "renderer/hooks/useFileOpenMode";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSidebarStore } from "renderer/stores";
import { useChangesStore } from "renderer/stores/changes";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";

/** Priority order for selecting the first file to open */
const FILE_CATEGORIES: Array<{
	key: "againstBase" | "staged" | "unstaged" | "untracked";
	category: ChangeCategory;
}> = [
	{ key: "againstBase", category: "against-base" },
	{ key: "staged", category: "staged" },
	{ key: "unstaged", category: "unstaged" },
	{ key: "untracked", category: "unstaged" },
];

export function SidebarControl() {
	const { isSidebarOpen, toggleSidebar } = useSidebarStore();

	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;

	const { getBaseBranch, selectFile } = useChangesStore();
	const baseBranch = getBaseBranch(worktreePath || "");
	const { data: branchData } = electronTrpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: !!worktreePath && !isSidebarOpen },
	);
	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? "main";

	const { data: status } = electronTrpc.changes.getStatus.useQuery(
		{ worktreePath: worktreePath || "", defaultBranch: effectiveBaseBranch },
		{ enabled: !!worktreePath && !isSidebarOpen },
	);

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const fileOpenMode = useFileOpenMode();
	const trpcUtils = electronTrpc.useUtils();

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
					"[SidebarControl/invalidateFileContent] Failed to invalidate:",
					{ worktreePath, filePath, error },
				);
			});
		},
		[worktreePath, trpcUtils],
	);

	const openFirstFile = useCallback(() => {
		if (!workspaceId || !worktreePath || !status) return;

		let firstFile: ChangedFile | undefined;
		let category: ChangeCategory | undefined;

		for (const { key, category: cat } of FILE_CATEGORIES) {
			const files = status[key];
			if (files && files.length > 0) {
				firstFile = files[0];
				category = cat;
				break;
			}
		}

		if (firstFile && category) {
			selectFile(worktreePath, firstFile, category, null);
			addFileViewerPane(workspaceId, {
				filePath: firstFile.path,
				diffCategory: category,
				oldPath: firstFile.oldPath,
				isPinned: false,
				openInNewTab: fileOpenMode === "new-tab",
			});
			invalidateFileContent(firstFile.path);
		}
	}, [
		workspaceId,
		worktreePath,
		status,
		selectFile,
		addFileViewerPane,
		invalidateFileContent,
		fileOpenMode,
	]);

	const handleClick = useCallback(() => {
		if (isSidebarOpen) {
			toggleSidebar();
		} else {
			toggleSidebar();
			openFirstFile();
		}
	}, [isSidebarOpen, toggleSidebar, openFirstFile]);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					onClick={handleClick}
					aria-label={
						isSidebarOpen ? "Hide Changes Sidebar" : "Show Changes Sidebar"
					}
					aria-pressed={isSidebarOpen}
					className={cn(
						"no-drag gap-1.5 h-6 px-1.5 rounded",
						isSidebarOpen
							? "font-semibold text-foreground bg-accent"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<LuDiff className="size-3" />
					<span className="text-xs">Changes</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				<HotkeyTooltipContent
					label="Open Changes Sidebar"
					hotkeyId="TOGGLE_SIDEBAR"
				/>
			</TooltipContent>
		</Tooltip>
	);
}
