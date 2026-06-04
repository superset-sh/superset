import type { ExternalApp } from "@superset/local-db";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { FileItem } from "../FileItem";

const ESTIMATED_ROW_HEIGHT = 28;
const OVERSCAN = 8;

interface FileListVirtualizedProps {
	files: ChangedFile[];
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	onFileSelect: (file: ChangedFile) => void;
	showStats?: boolean;
	onStage?: (file: ChangedFile) => void;
	onUnstage?: (file: ChangedFile) => void;
	isActioning?: boolean;
	worktreePath: string;
	onDiscard?: (file: ChangedFile) => void;
	category?: ChangeCategory;
	commitHash?: string;
	isExpandedView?: boolean;
	projectId?: string;
	defaultApp?: ExternalApp | null;
}

export function FileListVirtualized({
	files,
	selectedFile,
	selectedCommitHash,
	onFileSelect,
	showStats = true,
	onStage,
	onUnstage,
	isActioning,
	worktreePath,
	onDiscard,
	category,
	commitHash,
	isExpandedView,
	projectId,
	defaultApp,
}: FileListVirtualizedProps) {
	const listRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: files.length,
		getScrollElement: () =>
			listRef.current?.closest(
				"[data-changes-scroll-container]",
			) as HTMLElement | null,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		rangeExtractor: defaultRangeExtractor,
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
					const file = files[virtualRow.index];
					const isSelected =
						selectedFile?.path === file.path &&
						(!commitHash || selectedCommitHash === commitHash);

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
							<FileItem
								file={file}
								isSelected={isSelected}
								onClick={() => onFileSelect(file)}
								showStats={showStats}
								onStage={onStage ? () => onStage(file) : undefined}
								onUnstage={onUnstage ? () => onUnstage(file) : undefined}
								isActioning={isActioning}
								worktreePath={worktreePath}
								projectId={projectId}
								defaultApp={defaultApp}
								onDiscard={onDiscard ? () => onDiscard(file) : undefined}
								category={category}
								commitHash={commitHash}
								isExpandedView={isExpandedView}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
