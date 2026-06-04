import type { ExternalApp } from "@superset/local-db";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { FileItem } from "../FileItem";
import { FolderRow } from "../FolderRow";

const ESTIMATED_ROW_HEIGHT = 28;
const OVERSCAN = 8;

interface FileTreeNode {
	id: string;
	name: string;
	type: "file" | "folder";
	path: string;
	file?: ChangedFile;
	children?: FileTreeNode[];
}

interface FileListTreeVirtualizedProps {
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

type TreeRow =
	| { kind: "folder"; key: string; node: FileTreeNode; level: number }
	| { kind: "file"; key: string; file: ChangedFile; level: number };

function buildFileTree(files: ChangedFile[]): FileTreeNode[] {
	type TreeNodeInternal = Omit<FileTreeNode, "children"> & {
		children?: Record<string, TreeNodeInternal>;
	};

	const root: Record<string, TreeNodeInternal> = {};

	for (const file of files) {
		const parts = file.path.split("/");
		let current = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;
			const pathSoFar = parts.slice(0, i + 1).join("/");

			if (!current[part]) {
				current[part] = {
					id: pathSoFar,
					name: part,
					type: isLast ? "file" : "folder",
					path: pathSoFar,
					file: isLast ? file : undefined,
					children: isLast ? undefined : {},
				};
			}

			if (!isLast && current[part].children) {
				current = current[part].children;
			}
		}
	}

	function convertToArray(
		nodes: Record<string, TreeNodeInternal>,
	): FileTreeNode[] {
		return Object.values(nodes)
			.map((node) => ({
				...node,
				children: node.children ? convertToArray(node.children) : undefined,
			}))
			.sort((a, b) => {
				if (a.type !== b.type) {
					return a.type === "folder" ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			});
	}

	return convertToArray(root);
}

function buildFolderFileMap(tree: FileTreeNode[]): Map<string, ChangedFile[]> {
	const fileMap = new Map<string, ChangedFile[]>();

	const collect = (node: FileTreeNode): ChangedFile[] => {
		if (node.type === "file" && node.file) {
			return [node.file];
		}

		const files: ChangedFile[] = [];
		for (const child of node.children ?? []) {
			files.push(...collect(child));
		}

		fileMap.set(node.id, files);
		return files;
	};

	for (const node of tree) {
		collect(node);
	}

	return fileMap;
}

function flattenTreeRows(
	nodes: FileTreeNode[],
	expandedFolders: Record<string, boolean>,
	level = 0,
): TreeRow[] {
	const rows: TreeRow[] = [];

	for (const node of nodes) {
		if (node.type === "folder") {
			rows.push({
				kind: "folder",
				key: `folder:${node.id}`,
				node,
				level,
			});

			const isExpanded = expandedFolders[node.id] ?? true;
			if (isExpanded && node.children?.length) {
				rows.push(
					...flattenTreeRows(node.children, expandedFolders, level + 1),
				);
			}
			continue;
		}

		if (node.file) {
			rows.push({
				kind: "file",
				key: `file:${node.id}`,
				file: node.file,
				level,
			});
		}
	}

	return rows;
}

export function FileListTreeVirtualized({
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
}: FileListTreeVirtualizedProps) {
	const listRef = useRef<HTMLDivElement>(null);
	const [expandedFolders, setExpandedFolders] = useState<
		Record<string, boolean>
	>({});

	const tree = useMemo(() => buildFileTree(files), [files]);
	const folderFileMap = useMemo(() => buildFolderFileMap(tree), [tree]);
	const rows = useMemo(
		() => flattenTreeRows(tree, expandedFolders),
		[tree, expandedFolders],
	);

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
									name={row.node.name}
									isExpanded={expandedFolders[row.node.id] ?? true}
									onToggle={(expanded) =>
										setExpandedFolders((prev) => ({
											...prev,
											[row.node.id]: expanded,
										}))
									}
									level={row.level}
									variant="tree"
									folderPath={row.node.path}
									worktreePath={worktreePath}
									projectId={projectId}
									defaultApp={defaultApp}
									onStageAll={
										onStage || onStageFiles
											? () => {
													const folderFiles =
														folderFileMap.get(row.node.id) ?? [];
													if (onStageFiles) {
														onStageFiles(folderFiles);
														return;
													}
													for (const file of folderFiles) {
														onStage?.(file);
													}
												}
											: undefined
									}
									onUnstageAll={
										onUnstage || onUnstageFiles
											? () => {
													const folderFiles =
														folderFileMap.get(row.node.id) ?? [];
													if (onUnstageFiles) {
														onUnstageFiles(folderFiles);
														return;
													}
													for (const file of folderFiles) {
														onUnstage?.(file);
													}
												}
											: undefined
									}
									onDiscardAll={
										onDiscard
											? () => {
													const folderFiles =
														folderFileMap.get(row.node.id) ?? [];
													for (const file of folderFiles) {
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
								<FileItem
									file={row.file}
									isSelected={
										selectedFile?.path === row.file.path && !selectedCommitHash
									}
									onClick={() => onFileSelect(row.file)}
									showStats={showStats}
									level={row.level}
									onStage={onStage ? () => onStage(row.file) : undefined}
									onUnstage={onUnstage ? () => onUnstage(row.file) : undefined}
									isActioning={isActioning}
									worktreePath={worktreePath}
									projectId={projectId}
									defaultApp={defaultApp}
									onDiscard={onDiscard ? () => onDiscard(row.file) : undefined}
									category={category}
									commitHash={commitHash}
									isExpandedView={isExpandedView}
								/>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
