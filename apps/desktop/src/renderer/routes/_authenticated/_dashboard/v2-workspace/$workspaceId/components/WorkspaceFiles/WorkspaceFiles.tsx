import {
	useFileTree,
	useWorkspaceFsEventBridge,
	useWorkspaceFsEvents,
	workspaceTrpc,
} from "@superset/workspace-client";
import { useCallback, useMemo, useState } from "react";
import {
	ROW_HEIGHT,
	TREE_INDENT,
} from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/constants";
import { WorkspaceFilePreview } from "./components/WorkspaceFilePreview";
import { WorkspaceFilesSearchResultItem } from "./components/WorkspaceFilesSearchResultItem";
import { WorkspaceFilesToolbar } from "./components/WorkspaceFilesToolbar";
import { WorkspaceFilesTreeItem } from "./components/WorkspaceFilesTreeItem";
import { useWorkspaceFileSearch } from "./hooks/useWorkspaceFileSearch";

interface WorkspaceFilesProps {
	onSelectFile: (absolutePath: string) => void;
	selectedFilePath?: string;
	workspaceId: string;
}

export function WorkspaceFiles({
	onSelectFile,
	selectedFilePath,
	workspaceId,
}: WorkspaceFilesProps) {
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const utils = workspaceTrpc.useUtils();
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const rootPath = workspaceQuery.data?.worktreePath ?? "";

	useWorkspaceFsEventBridge(
		workspaceId,
		Boolean(workspaceId && workspaceQuery.data?.worktreePath),
	);

	const fileTree = useFileTree({
		workspaceId,
		rootPath,
	});
	const {
		hasQuery,
		isFetching: isFetchingSearch,
		searchResults,
	} = useWorkspaceFileSearch({
		searchTerm,
		workspaceId,
	});

	useWorkspaceFsEvents(
		workspaceId,
		() => {
			if (searchTerm.trim().length === 0) {
				return;
			}

			void utils.filesystem.searchFiles.invalidate();
		},
		Boolean(workspaceId && searchTerm.trim().length > 0),
	);

	const flattenedTreeEntries = useMemo(() => {
		const entries: Array<{
			depth: number;
			node: (typeof fileTree.rootEntries)[number];
		}> = [];

		const visitNodes = (
			nodes: typeof fileTree.rootEntries,
			depth: number,
		): void => {
			for (const node of nodes) {
				entries.push({ node, depth });
				if (node.isExpanded && node.children.length > 0) {
					visitNodes(node.children, depth + 1);
				}
			}
		};

		visitNodes(fileTree.rootEntries, 0);
		return entries;
	}, [fileTree.rootEntries]);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			await fileTree.refreshAll();
		} finally {
			setIsRefreshing(false);
		}
	}, [fileTree]);

	if (workspaceQuery.isPending) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading workspace files...
			</div>
		);
	}

	if (!workspaceQuery.data?.worktreePath) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Workspace worktree not available
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 overflow-hidden">
			<div className="flex w-80 min-w-80 flex-col border-r border-border">
				<WorkspaceFilesToolbar
					isRefreshing={isRefreshing}
					onCollapseAll={fileTree.collapseAll}
					onNewFile={() => {}}
					onNewFolder={() => {}}
					onRefresh={() => void handleRefresh()}
					onSearchChange={setSearchTerm}
					searchTerm={searchTerm}
				/>
				<div className="min-h-0 flex-1 overflow-y-auto p-2">
					{hasQuery ? (
						searchResults.length === 0 ? (
							<div className="px-2 py-3 text-sm text-muted-foreground">
								{isFetchingSearch ? "Searching files..." : "No matches found"}
							</div>
						) : (
							<div className="flex flex-col">
								{searchResults.map((entry) => (
									<WorkspaceFilesSearchResultItem
										entry={entry}
										key={entry.absolutePath}
										onActivate={onSelectFile}
										selectedFilePath={selectedFilePath}
									/>
								))}
							</div>
						)
					) : fileTree.isLoadingRoot && fileTree.rootEntries.length === 0 ? (
						<div className="px-2 py-3 text-sm text-muted-foreground">
							Loading files...
						</div>
					) : fileTree.rootEntries.length === 0 ? (
						<div className="px-2 py-3 text-sm text-muted-foreground">
							No files found
						</div>
					) : (
						<div className="flex flex-col">
							{flattenedTreeEntries.map(({ depth, node }) => (
								<WorkspaceFilesTreeItem
									depth={depth}
									indent={TREE_INDENT}
									key={node.absolutePath}
									node={node}
									onSelectFile={onSelectFile}
									onToggleDirectory={(absolutePath) =>
										void fileTree.toggle(absolutePath)
									}
									rowHeight={ROW_HEIGHT}
									selectedFilePath={selectedFilePath}
								/>
							))}
						</div>
					)}
				</div>
			</div>
			<div className="min-h-0 flex-1">
				<WorkspaceFilePreview
					selectedFilePath={selectedFilePath}
					workspaceId={workspaceId}
				/>
			</div>
		</div>
	);
}
