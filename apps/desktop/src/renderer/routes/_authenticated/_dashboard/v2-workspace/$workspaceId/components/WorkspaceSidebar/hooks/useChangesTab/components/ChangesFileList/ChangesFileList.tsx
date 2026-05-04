import { memo, useMemo } from "react";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { ChangesSection } from "./components/ChangesSection";
import { FileRow } from "./components/FileRow";

interface ChangesFileListProps {
	files: ChangesetFile[];
	workspaceId: string;
	isLoading?: boolean;
	worktreePath?: string;
	onSelectFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

type GroupKey = "unstaged" | "staged" | "against-base" | "commit";

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
	worktreePath,
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
		<div className="min-h-0 flex-1 overflow-y-auto">
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
						{groupFiles.map((file) => (
							<FileRow
								key={`${file.source.kind}:${file.path}`}
								file={file}
								workspaceId={workspaceId}
								worktreePath={worktreePath}
								onSelect={onSelectFile}
								onOpenFile={onOpenFile}
								onOpenInEditor={onOpenInEditor}
							/>
						))}
					</ChangesSection>
				);
			})}
		</div>
	);
});
