import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useMemo, useRef, useState } from "react";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { ChangesSectionHeader } from "./components/ChangesSection";
import { FileRow } from "./components/FileRow";
import {
	buildChangesRows,
	type GroupKey,
	groupChangesetFiles,
} from "./utils/buildChangesRows";

const ESTIMATED_ROW_HEIGHT = 28;
const OVERSCAN = 8;

interface ChangesFileListProps {
	files: ChangesetFile[];
	workspaceId: string;
	isLoading?: boolean;
	worktreePath?: string;
	onSelectFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

const DEFAULT_OPEN_GROUPS: Record<GroupKey, boolean> = {
	unstaged: true,
	staged: true,
	"against-base": true,
	commit: true,
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
	const scrollRef = useRef<HTMLDivElement>(null);
	const [openGroups, setOpenGroups] =
		useState<Record<GroupKey, boolean>>(DEFAULT_OPEN_GROUPS);

	const grouped = useMemo(() => groupChangesetFiles(files), [files]);
	const rows = useMemo(
		() => buildChangesRows(grouped, openGroups),
		[grouped, openGroups],
	);

	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		overscan: OVERSCAN,
	});

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

	const virtualItems = virtualizer.getVirtualItems();

	return (
		<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
			<div
				className="relative w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualItems.map((virtualRow) => {
					const row = rows[virtualRow.index];
					if (!row) return null;
					const hasStagingActions =
						row.groupKey === "unstaged" || row.groupKey === "staged";
					return (
						<div
							key={row.key}
							data-index={virtualRow.index}
							ref={virtualizer.measureElement}
							className="absolute left-0 w-full"
							style={{ top: virtualRow.start }}
						>
							{row.kind === "header" ? (
								<ChangesSectionHeader
									title={row.title}
									count={row.count}
									open={row.open}
									onOpenChange={(open) =>
										setOpenGroups((prev) => ({ ...prev, [row.groupKey]: open }))
									}
									stagingActions={
										hasStagingActions
											? {
													kind: row.groupKey as "unstaged" | "staged",
													workspaceId,
												}
											: undefined
									}
								/>
							) : (
								<FileRow
									file={row.file}
									workspaceId={workspaceId}
									worktreePath={worktreePath}
									onSelect={onSelectFile}
									onOpenFile={onOpenFile}
									onOpenInEditor={onOpenInEditor}
								/>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
});
