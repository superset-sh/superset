import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { ChangedFile, CommitInfo } from "shared/changes-types";
import type { ChangesViewMode } from "../../types";
import { CommitItem } from "../CommitItem";

const ESTIMATED_ROW_HEIGHT = 28;
const OVERSCAN = 10;

interface CommitListVirtualizedProps {
	commits: CommitInfo[];
	expandedCommits: Set<string>;
	onCommitToggle: (commitHash: string) => void;
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	onFileSelect: (file: ChangedFile, commitHash: string) => void;
	viewMode: ChangesViewMode;
	worktreePath: string;
	projectId?: string;
	isExpandedView?: boolean;
}

export function CommitListVirtualized({
	commits,
	expandedCommits,
	onCommitToggle,
	selectedFile,
	selectedCommitHash,
	onFileSelect,
	viewMode,
	worktreePath,
	projectId,
	isExpandedView,
}: CommitListVirtualizedProps) {
	const listRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: commits.length,
		getScrollElement: () =>
			listRef.current?.closest(
				"[data-changes-scroll-container]",
			) as HTMLElement | null,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		overscan: OVERSCAN,
		scrollMargin: listRef.current?.offsetTop ?? 0,
	});

	const items = virtualizer.getVirtualItems();

	return (
		<div ref={listRef}>
			<div
				className="relative w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{items.map((virtualRow) => {
					const commit = commits[virtualRow.index];

					return (
						<div
							key={virtualRow.key}
							data-index={virtualRow.index}
							ref={virtualizer.measureElement}
							className="absolute left-0 w-full"
							style={{
								top: virtualRow.start - (virtualizer.options.scrollMargin ?? 0),
							}}
						>
							<CommitItem
								commit={commit}
								isExpanded={expandedCommits.has(commit.hash)}
								onToggle={() => onCommitToggle(commit.hash)}
								selectedFile={selectedFile}
								selectedCommitHash={selectedCommitHash}
								onFileSelect={onFileSelect}
								viewMode={viewMode}
								worktreePath={worktreePath}
								projectId={projectId}
								isExpandedView={isExpandedView}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
