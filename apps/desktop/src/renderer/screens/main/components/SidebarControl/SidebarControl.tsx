import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuGitCompareArrows } from "react-icons/lu";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { trpc } from "renderer/lib/trpc";
import { useChangesStore } from "renderer/stores/changes";
import { useSidebarStore } from "renderer/stores";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";

export function SidebarControl() {
	const { isSidebarOpen, toggleSidebar } = useSidebarStore();

	// Get active workspace for file opening
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const workspaceId = activeWorkspace?.id;
	const worktreePath = activeWorkspace?.worktreePath;

	// Get base branch for changes query
	const { baseBranch, selectFile } = useChangesStore();
	const { data: branchData } = trpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: !!worktreePath },
	);
	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? "main";

	// Get changes status
	const { data: status } = trpc.changes.getStatus.useQuery(
		{ worktreePath: worktreePath || "", defaultBranch: effectiveBaseBranch },
		{ enabled: !!worktreePath },
	);

	// Access tabs store for file opening
	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const trpcUtils = trpc.useUtils();

	const invalidateFileContent = (filePath: string) => {
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
				"[SidebarControl/invalidateFileContent] Failed to invalidate file content queries:",
				{ worktreePath, filePath, error },
			);
		});
	};

	const openFirstFile = () => {
		if (!workspaceId || !worktreePath || !status) return;

		// Find the first file to open in priority order
		let firstFile: ChangedFile | null = null;
		let category: ChangeCategory | null = null;

		// Check against base first, then staged, then unstaged/untracked
		if (status.againstBase && status.againstBase.length > 0) {
			firstFile = status.againstBase[0];
			category = "against-base";
		} else if (status.staged && status.staged.length > 0) {
			firstFile = status.staged[0];
			category = "staged";
		} else if (status.unstaged && status.unstaged.length > 0) {
			firstFile = status.unstaged[0];
			category = "unstaged";
		} else if (status.untracked && status.untracked.length > 0) {
			firstFile = status.untracked[0];
			category = "unstaged";
		}

		if (firstFile && category) {
			// Update selection in changes store
			selectFile(worktreePath, firstFile, category, null);
			// Open file in pane
			addFileViewerPane(workspaceId, {
				filePath: firstFile.path,
				diffCategory: category,
				oldPath: firstFile.oldPath,
				isPinned: false,
			});
			invalidateFileContent(firstFile.path);
		}
	};

	const handleClick = () => {
		if (isSidebarOpen) {
			// Just close the sidebar
			toggleSidebar();
		} else {
			// Open sidebar and open first file if available
			toggleSidebar();
			openFirstFile();
		}
	};

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
						"no-drag gap-1.5",
						isSidebarOpen
							? "font-semibold text-foreground bg-accent"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<LuGitCompareArrows className="size-4" />
					<span className="text-xs">Changes</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				<HotkeyTooltipContent
					label="Toggle Changes Sidebar"
					hotkeyId="TOGGLE_SIDEBAR"
				/>
			</TooltipContent>
		</Tooltip>
	);
}
