import { memo, useMemo } from "react";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import type { ChangesViewMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { ChangesFoldersView } from "./components/ChangesFoldersView";
import { ChangesSection } from "./components/ChangesSection";
import { ChangesTreeView } from "./components/ChangesTreeView";

/** Pulse from the toolbar's expand-all / collapse-all buttons. `epoch` is 0 until the first press. */
export interface FoldSignal {
	epoch: number;
	action: "collapse" | "expand";
}

interface ChangesFileListProps {
	files: ChangesetFile[];
	workspaceId: string;
	isLoading?: boolean;
	viewMode: ChangesViewMode;
	worktreePath?: string;
	selectedFilePath?: string;
	foldSignal: FoldSignal;
	onSelectFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

type GroupKey = ChangesetFile["source"]["kind"];

const GROUP_ORDER: GroupKey[] = [
	"unstaged",
	"staged",
	"against-base",
	"commit",
];

const GROUP_TITLES: Record<GroupKey, string> = {
	unstaged: "Unstaged",
	staged: "Staged",
	"against-base": "Against base",
	commit: "Committed",
};

export const ChangesFileList = memo(function ChangesFileList({
	files,
	workspaceId,
	isLoading,
	viewMode,
	worktreePath,
	selectedFilePath,
	foldSignal,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
}: ChangesFileListProps) {
	const grouped = useMemo(() => {
		const groups: Record<GroupKey, ChangesetFile[]> = {
			unstaged: [],
			staged: [],
			"against-base": [],
			commit: [],
		};
		for (const file of files) {
			groups[file.source.kind].push(file);
		}
		return groups;
	}, [files]);

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading...
			</div>
		);
	}

	if (files.length === 0) {
		return (
			<div className="px-3 py-6 text-center text-sm text-muted-foreground">
				No changes
			</div>
		);
	}

	return (
		<div
			data-changes-file-list-scroll="true"
			className="min-h-0 flex-1 space-y-2 overflow-y-auto pt-1"
		>
			{GROUP_ORDER.map((key) => {
				const groupFiles = grouped[key];
				if (groupFiles.length === 0) return null;
				const hasStagingActions = key === "unstaged" || key === "staged";
				return (
					<ChangesSection
						key={key}
						title={GROUP_TITLES[key]}
						count={groupFiles.length}
						stagingActions={
							hasStagingActions
								? { kind: key as "unstaged" | "staged", workspaceId }
								: undefined
						}
					>
						{viewMode === "tree" ? (
							<ChangesTreeView
								files={groupFiles}
								sectionKind={key}
								workspaceId={workspaceId}
								worktreePath={worktreePath}
								selectedFilePath={selectedFilePath}
								foldSignal={foldSignal}
								onSelectFile={onSelectFile}
								onOpenFile={onOpenFile}
								onOpenInEditor={onOpenInEditor}
							/>
						) : (
							<ChangesFoldersView
								files={groupFiles}
								workspaceId={workspaceId}
								worktreePath={worktreePath}
								foldSignal={foldSignal}
								onSelectFile={onSelectFile}
								onOpenFile={onOpenFile}
								onOpenInEditor={onOpenInEditor}
							/>
						)}
					</ChangesSection>
				);
			})}
		</div>
	);
});
