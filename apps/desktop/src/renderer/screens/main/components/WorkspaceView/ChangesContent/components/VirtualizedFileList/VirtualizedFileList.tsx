import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { type RefObject, useRef } from "react";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { createFileKey, useScrollContext } from "../../context";
import { FileDiffSection } from "../FileDiffSection";
import { getEstimatedFileDiffSectionHeight } from "./utils/getEstimatedFileDiffSectionHeight";
import { isFileExpanded } from "./utils/isFileExpanded";

interface VirtualizedFileListProps {
	files: ChangedFile[];
	category: ChangeCategory;
	commitHash?: string;
	worktreePath: string;
	baseBranch?: string;
	collapsedFiles: Set<string>;
	onToggleFile: (key: string) => void;
	scrollElementRef: RefObject<HTMLDivElement | null>;
	onStage?: (file: ChangedFile) => void;
	onUnstage?: (file: ChangedFile) => void;
	onDiscard?: (file: ChangedFile) => void;
	isActioning?: boolean;
}

const OVERSCAN = 1;

export function VirtualizedFileList({
	files,
	category,
	commitHash,
	worktreePath,
	baseBranch,
	collapsedFiles,
	onToggleFile,
	scrollElementRef,
	onStage,
	onUnstage,
	onDiscard,
	isActioning = false,
}: VirtualizedFileListProps) {
	const listRef = useRef<HTMLDivElement>(null);
	const { viewedFiles } = useScrollContext();

	const virtualizer = useVirtualizer({
		count: files.length,
		getScrollElement: () => scrollElementRef.current,
		estimateSize: (index) => {
			const file = files[index];
			const fileKey = createFileKey(file, category, commitHash, worktreePath);
			return getEstimatedFileDiffSectionHeight({
				file,
				isCollapsed: !isFileExpanded(fileKey, collapsedFiles, viewedFiles),
			});
		},
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
					const fileKey = createFileKey(
						file,
						category,
						commitHash,
						worktreePath,
					);

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
							<FileDiffSection
								file={file}
								category={category}
								commitHash={commitHash}
								worktreePath={worktreePath}
								baseBranch={baseBranch}
								isExpanded={isFileExpanded(
									fileKey,
									collapsedFiles,
									viewedFiles,
								)}
								onToggleExpanded={() => onToggleFile(fileKey)}
								onStage={onStage ? () => onStage(file) : undefined}
								onUnstage={onUnstage ? () => onUnstage(file) : undefined}
								onDiscard={onDiscard ? () => onDiscard(file) : undefined}
								isActioning={isActioning}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
