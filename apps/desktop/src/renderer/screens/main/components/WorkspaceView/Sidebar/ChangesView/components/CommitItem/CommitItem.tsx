import type { ChangedFile, CommitInfo } from "shared/changes-types";
import type { ChangesViewMode } from "../../types";
import { formatRelativeDate } from "../../utils";
import { CollapsibleRow } from "../CollapsibleRow";
import { FileList } from "../FileList";

interface CommitItemProps {
	commit: CommitInfo;
	isExpanded: boolean;
	onToggle: () => void;
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	/** Single click - opens in preview mode */
	onFileSelect: (file: ChangedFile, commitHash: string) => void;
	/** Double click - opens pinned (permanent) */
	onFileDoubleClick?: (file: ChangedFile, commitHash: string) => void;
	viewMode: ChangesViewMode;
	/** Worktree path for constructing absolute paths */
	worktreePath?: string;
}

function CommitHeader({
	shortHash,
	message,
	date,
}: {
	shortHash: string;
	message: string;
	date: Date;
}) {
	return (
		<>
			<span className="text-[10px] font-mono text-muted-foreground shrink-0">
				{shortHash}
			</span>
			<span className="text-xs flex-1 truncate">{message}</span>
			<span className="text-[10px] text-muted-foreground shrink-0">
				{formatRelativeDate(date)}
			</span>
		</>
	);
}

export function CommitItem({
	commit,
	isExpanded,
	onToggle,
	selectedFile,
	selectedCommitHash,
	onFileSelect,
	onFileDoubleClick,
	viewMode,
	worktreePath,
}: CommitItemProps) {
	const hasFiles = commit.files.length > 0;

	const handleFileSelect = (file: ChangedFile) => {
		onFileSelect(file, commit.hash);
	};

	const handleFileDoubleClick = (file: ChangedFile) => {
		onFileDoubleClick?.(file, commit.hash);
	};

	const isCommitSelected = selectedCommitHash === commit.hash;

	return (
		<CollapsibleRow
			isExpanded={isExpanded}
			onToggle={() => onToggle()}
			triggerClassName="mx-0.5"
			contentClassName="ml-4 pl-1.5 border-l border-border mt-0.5 mb-0.5"
			header={
				<CommitHeader
					shortHash={commit.shortHash}
					message={commit.message}
					date={commit.date}
				/>
			}
		>
			{hasFiles && (
				<FileList
					files={commit.files}
					viewMode={viewMode}
					selectedFile={isCommitSelected ? selectedFile : null}
					selectedCommitHash={selectedCommitHash}
					onFileSelect={handleFileSelect}
					onFileDoubleClick={handleFileDoubleClick}
					worktreePath={worktreePath}
					category="committed"
					commitHash={commit.hash}
				/>
			)}
		</CollapsibleRow>
	);
}
