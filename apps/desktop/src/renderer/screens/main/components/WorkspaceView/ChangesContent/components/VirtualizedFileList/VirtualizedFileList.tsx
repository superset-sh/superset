import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { type RefObject, useRef } from "react";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { FileDiffSection } from "../FileDiffSection";

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

const ESTIMATED_COLLAPSED_HEIGHT = 60;
const OVERSCAN = 5;

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

	const virtualizer = useVirtualizer({
		count: files.length,
		getScrollElement: () => scrollElementRef.current,
		estimateSize: () => ESTIMATED_COLLAPSED_HEIGHT,
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
					const fileKey = commitHash
						? `${category}:${commitHash}:${file.path}`
						: `${category}::${file.path}`;

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
								isExpanded={!collapsedFiles.has(fileKey)}
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
