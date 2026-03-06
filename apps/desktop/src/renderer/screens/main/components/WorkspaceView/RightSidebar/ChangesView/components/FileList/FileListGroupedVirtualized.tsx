import type { ExternalApp } from "@superset/local-db";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { FileItem } from "../FileItem";
import { FolderRow } from "../FolderRow";

const ESTIMATED_ROW_HEIGHT = 28;
const OVERSCAN = 8;

interface FileListGroupedVirtualizedProps {
	files: ChangedFile[];
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	onFileSelect: (file: ChangedFile) => void;
	showStats?: boolean;
	onStage?: (file: ChangedFile) => void;
	onUnstage?: (file: ChangedFile) => void;
	onStageFiles?: (files: ChangedFile[]) => void;
	onUnstageFiles?: (files: ChangedFile[]) => void;
	isActioning?: boolean;
	worktreePath: string;
	onDiscard?: (file: ChangedFile) => void;
	category?: ChangeCategory;
	commitHash?: string;
	isExpandedView?: boolean;
	projectId?: string;
	defaultApp?: ExternalApp | null;
}

interface FolderGroup {
	folderPath: string;
	displayName: string;
	files: ChangedFile[];
}

function groupFilesByFolder(files: ChangedFile[]): FolderGroup[] {
	const folderMap = new Map<string, ChangedFile[]>();

	for (const file of files) {
		const pathParts = file.path.split("/");
		const folderPath =
			pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "";

		if (!folderMap.has(folderPath)) {
			folderMap.set(folderPath, []);
		}
		folderMap.get(folderPath)?.push(file);
	}

	return Array.from(folderMap.entries())
		.map(([folderPath, groupFiles]) => ({
			folderPath,
			displayName: folderPath || "Root Path",
			files: groupFiles.sort((a, b) => {
				const aName = a.path.split("/").pop() || "";
				const bName = b.path.split("/").pop() || "";
				return aName.localeCompare(bName);
			}),
		}))
		.sort((a, b) => a.folderPath.localeCompare(b.folderPath));
}

type GroupedRow =
	| { kind: "folder"; key: string; group: FolderGroup }
	| { kind: "file"; key: string; file: ChangedFile; group: FolderGroup };

export function FileListGroupedVirtualized({
	files,
	selectedFile,
	selectedCommitHash,
	onFileSelect,
	showStats = true,
	onStage,
	onUnstage,
	onStageFiles,
	onUnstageFiles,
	isActioning,
	worktreePath,
	onDiscard,
	category,
	commitHash,
	isExpandedView,
	projectId,
	defaultApp,
}: FileListGroupedVirtualizedProps) {
	const listRef = useRef<HTMLDivElement>(null);
	const [expandedFolders, setExpandedFolders] = useState<
		Record<string, boolean>
	>({});

	const groups = useMemo(() => groupFilesByFolder(files), [files]);

	const rows = useMemo(() => {
		const nextRows: GroupedRow[] = [];

		for (const group of groups) {
			nextRows.push({
				kind: "folder",
				key: `folder:${group.folderPath || "__root__"}`,
				group,
			});

			const isExpanded = expandedFolders[group.folderPath] ?? true;
			if (!isExpanded) continue;

			for (const file of group.files) {
				nextRows.push({
					kind: "file",
					key: `file:${file.path}`,
					file,
					group,
				});
			}
		}

		return nextRows;
	}, [groups, expandedFolders]);

	const virtualizer = useVirtualizer({
		count: rows.length,
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
					const row = rows[virtualRow.index];
					if (!row) return null;

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
							{row.kind === "folder" ? (
								<FolderRow
									name={row.group.displayName}
									isExpanded={expandedFolders[row.group.folderPath] ?? true}
									onToggle={(expanded) =>
										setExpandedFolders((prev) => ({
											...prev,
											[row.group.folderPath]: expanded,
										}))
									}
									fileCount={row.group.files.length}
									variant="grouped"
									folderPath={row.group.folderPath}
									worktreePath={worktreePath}
									projectId={projectId}
									defaultApp={defaultApp}
									onStageAll={
										onStage || onStageFiles
											? () => {
													if (onStageFiles) {
														onStageFiles(row.group.files);
														return;
													}
													for (const file of row.group.files) {
														onStage?.(file);
													}
												}
											: undefined
									}
									onUnstageAll={
										onUnstage || onUnstageFiles
											? () => {
													if (onUnstageFiles) {
														onUnstageFiles(row.group.files);
														return;
													}
													for (const file of row.group.files) {
														onUnstage?.(file);
													}
												}
											: undefined
									}
									onDiscardAll={
										onDiscard
											? () => {
													for (const file of row.group.files) {
														onDiscard(file);
													}
												}
											: undefined
									}
									isActioning={isActioning}
								>
									{null}
								</FolderRow>
							) : (
								<div className="ml-1.5 border-l border-border pl-0.5">
									<FileItem
										file={row.file}
										isSelected={
											selectedFile?.path === row.file.path &&
											(!commitHash || selectedCommitHash === commitHash)
										}
										onClick={() => onFileSelect(row.file)}
										showStats={showStats}
										onStage={onStage ? () => onStage(row.file) : undefined}
										onUnstage={
											onUnstage ? () => onUnstage(row.file) : undefined
										}
										isActioning={isActioning}
										worktreePath={worktreePath}
										projectId={projectId}
										defaultApp={defaultApp}
										onDiscard={
											onDiscard ? () => onDiscard(row.file) : undefined
										}
										category={category}
										commitHash={commitHash}
										isExpandedView={isExpandedView}
									/>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
