import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
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
	selectedChangeKey?: string;
	foldSignal: FoldSignal;
	onSelectFile?: (
		path: string,
		openInNewTab?: boolean,
		changeKey?: string,
	) => void;
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

const GROUP_TITLES: Record<GroupKey, MessageDescriptor> = {
	unstaged: msg({
		message: "Unstaged",
	}),
	staged: msg({ message: "Staged" }),
	"against-base": msg({
		message: "Against base",
	}),
	commit: msg({
		message: "Committed",
	}),
};

export const ChangesFileList = memo(function ChangesFileList({
	files,
	workspaceId,
	isLoading,
	viewMode,
	worktreePath,
	selectedFilePath,
	selectedChangeKey,
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
				<Trans>Loading...</Trans>
			</div>
		);
	}

	if (files.length === 0) {
		return (
			<div className="px-3 py-6 text-center text-sm text-muted-foreground">
				<Trans>No changes</Trans>
			</div>
		);
	}

	return (
		<OverflowFadeContainer
			fadeEdges={["top", "bottom"]}
			className="relative min-h-0 flex-1 space-y-2 overflow-y-auto pt-1"
			data-changes-scroll-container
		>
			{GROUP_ORDER.map((key) => {
				const groupFiles = grouped[key];
				if (groupFiles.length === 0) return null;
				const hasStagingActions = key === "unstaged" || key === "staged";
				return (
					<ChangesSection
						key={key}
						sectionKey={key}
						title={i18n._(GROUP_TITLES[key])}
						count={groupFiles.length}
						additions={groupFiles.reduce((sum, f) => sum + f.additions, 0)}
						deletions={groupFiles.reduce((sum, f) => sum + f.deletions, 0)}
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
								selectedChangeKey={selectedChangeKey}
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
								selectedFilePath={selectedFilePath}
								selectedChangeKey={selectedChangeKey}
								foldSignal={foldSignal}
								onSelectFile={onSelectFile}
								onOpenFile={onOpenFile}
								onOpenInEditor={onOpenInEditor}
							/>
						)}
					</ChangesSection>
				);
			})}
		</OverflowFadeContainer>
	);
});
