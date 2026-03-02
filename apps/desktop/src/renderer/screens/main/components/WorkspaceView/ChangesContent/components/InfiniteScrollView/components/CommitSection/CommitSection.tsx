import { type RefObject, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { CommitInfo } from "shared/changes-types";
import { VirtualizedFileList } from "../../../VirtualizedFileList";

interface CommitSectionProps {
	commit: CommitInfo;
	worktreePath: string;
	collapsedFiles: Set<string>;
	onToggleFile: (key: string) => void;
	scrollElementRef: RefObject<HTMLDivElement | null>;
}

export function CommitSection({
	commit,
	worktreePath,
	collapsedFiles,
	onToggleFile,
	scrollElementRef,
}: CommitSectionProps) {
	const [isCommitExpanded, setIsCommitExpanded] = useState(false);

	const { data: commitFiles } = electronTrpc.changes.getCommitFiles.useQuery(
		{
			worktreePath,
			commitHash: commit.hash,
		},
		{ enabled: isCommitExpanded },
	);

	const files = commitFiles ?? [];

	return (
		<div className="border-b border-border">
			<button
				type="button"
				onClick={() => setIsCommitExpanded(!isCommitExpanded)}
				className="flex items-center gap-2 px-4 py-2 w-full text-left hover:bg-accent/50 transition-colors"
			>
				{isCommitExpanded ? (
					<LuChevronDown className="size-4 text-muted-foreground" />
				) : (
					<LuChevronRight className="size-4 text-muted-foreground" />
				)}
				<span className="text-xs font-mono text-muted-foreground">
					{commit.shortHash}
				</span>
				<span className="text-sm truncate flex-1">{commit.message}</span>
				<span className="text-xs text-muted-foreground">
					{commit.files.length} files
				</span>
			</button>
			{isCommitExpanded && files.length > 0 && (
				<div className="pl-4">
					<VirtualizedFileList
						files={files}
						category="committed"
						commitHash={commit.hash}
						worktreePath={worktreePath}
						collapsedFiles={collapsedFiles}
						onToggleFile={onToggleFile}
						scrollElementRef={scrollElementRef}
					/>
				</div>
			)}
		</div>
	);
}
