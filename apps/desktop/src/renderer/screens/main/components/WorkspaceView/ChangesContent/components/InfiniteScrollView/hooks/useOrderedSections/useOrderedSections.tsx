import type { ReactNode, RefObject } from "react";
import { getOrderedChangeSectionIds } from "renderer/stores/changes/section-order";
import type {
	ChangeCategory,
	ChangedFile,
	CommitInfo,
} from "shared/changes-types";
import { VirtualizedFileList } from "../../../VirtualizedFileList";
import { CommitSection } from "../../components/CommitSection";

export interface OrderedSection {
	id: ChangeCategory;
	title: string;
	count: number;
	isExpanded: boolean;
	onToggle: () => void;
	content: ReactNode;
}

interface UseOrderedSectionsInput {
	sectionOrder: ChangeCategory[];
	baseBranch: string;
	worktreePath: string;
	scrollElementRef: RefObject<HTMLDivElement | null>;
	collapsedFiles: Set<string>;
	onToggleFile: (key: string) => void;
	expandedSections: Record<ChangeCategory, boolean>;
	toggleSection: (section: ChangeCategory) => void;
	againstBaseFiles: ChangedFile[];
	commits: CommitInfo[];
	stagedFiles: ChangedFile[];
	unstagedFiles: ChangedFile[];
	onUnstageFile: (file: ChangedFile) => void;
	onStageFile: (file: ChangedFile) => void;
	onDiscardFile: (file: ChangedFile) => void;
	isActioning: boolean;
}

export function useOrderedSections({
	sectionOrder,
	baseBranch,
	worktreePath,
	scrollElementRef,
	collapsedFiles,
	onToggleFile,
	expandedSections,
	toggleSection,
	againstBaseFiles,
	commits,
	stagedFiles,
	unstagedFiles,
	onUnstageFile,
	onStageFile,
	onDiscardFile,
	isActioning,
}: UseOrderedSectionsInput) {
	const committedFileCount = commits.reduce(
		(acc, commit) => acc + commit.files.length,
		0,
	);

	const sectionDefinitions = {
		"against-base": {
			id: "against-base",
			title: `Against ${baseBranch}`,
			count: againstBaseFiles.length,
			isExpanded: expandedSections["against-base"],
			onToggle: () => toggleSection("against-base"),
			content: expandedSections["against-base"] ? (
				<VirtualizedFileList
					files={againstBaseFiles}
					category="against-base"
					worktreePath={worktreePath}
					baseBranch={baseBranch}
					collapsedFiles={collapsedFiles}
					onToggleFile={onToggleFile}
					scrollElementRef={scrollElementRef}
				/>
			) : null,
		},
		committed: {
			id: "committed",
			title: "Commits",
			count: committedFileCount,
			isExpanded: expandedSections.committed,
			onToggle: () => toggleSection("committed"),
			content: expandedSections.committed ? (
				<div>
					{commits.map((commit) => (
						<CommitSection
							key={commit.hash}
							commit={commit}
							worktreePath={worktreePath}
							collapsedFiles={collapsedFiles}
							onToggleFile={onToggleFile}
							scrollElementRef={scrollElementRef}
						/>
					))}
				</div>
			) : null,
		},
		staged: {
			id: "staged",
			title: "Staged",
			count: stagedFiles.length,
			isExpanded: expandedSections.staged,
			onToggle: () => toggleSection("staged"),
			content: expandedSections.staged ? (
				<VirtualizedFileList
					files={stagedFiles}
					category="staged"
					worktreePath={worktreePath}
					collapsedFiles={collapsedFiles}
					onToggleFile={onToggleFile}
					scrollElementRef={scrollElementRef}
					onUnstage={onUnstageFile}
					onDiscard={onDiscardFile}
					isActioning={isActioning}
				/>
			) : null,
		},
		unstaged: {
			id: "unstaged",
			title: "Unstaged",
			count: unstagedFiles.length,
			isExpanded: expandedSections.unstaged,
			onToggle: () => toggleSection("unstaged"),
			content: expandedSections.unstaged ? (
				<VirtualizedFileList
					files={unstagedFiles}
					category="unstaged"
					worktreePath={worktreePath}
					collapsedFiles={collapsedFiles}
					onToggleFile={onToggleFile}
					scrollElementRef={scrollElementRef}
					onStage={onStageFile}
					onDiscard={onDiscardFile}
					isActioning={isActioning}
				/>
			) : null,
		},
	} satisfies Record<ChangeCategory, OrderedSection>;

	return getOrderedChangeSectionIds(sectionOrder).map(
		(section) => sectionDefinitions[section],
	);
}
