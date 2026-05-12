import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { FileRow } from "../FileRow";

const ESTIMATED_ROW_HEIGHT = 28;
const OVERSCAN = 10;

interface VirtualizedFileListProps {
	files: ChangesetFile[];
	workspaceId: string;
	worktreePath?: string;
	onSelectFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

export function VirtualizedFileList({
	files,
	workspaceId,
	worktreePath,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
}: VirtualizedFileListProps) {
	const listRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: files.length,
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
					const file = files[virtualRow.index];
					if (!file) return null;
					return (
						<div
							key={`${file.source.kind}:${file.path}`}
							data-index={virtualRow.index}
							ref={virtualizer.measureElement}
							className="absolute left-0 w-full"
							style={{
								top: virtualRow.start - (virtualizer.options.scrollMargin ?? 0),
							}}
						>
							<FileRow
								file={file}
								workspaceId={workspaceId}
								worktreePath={worktreePath}
								onSelect={onSelectFile}
								onOpenFile={onOpenFile}
								onOpenInEditor={onOpenInEditor}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
