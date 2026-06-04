import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import type { FoldSignal } from "../../ChangesFileList";
import { FileRow } from "../FileRow";
import { FolderHeader } from "./components/FolderHeader";

const ROOT_FOLDER_KEY = "";
const ROOT_FOLDER_LABEL = "Root Path";

interface ChangesFoldersViewProps {
	files: ChangesetFile[];
	workspaceId: string;
	worktreePath?: string;
	/** Bumped by the toolbar's expand-all / collapse-all buttons. */
	foldSignal: FoldSignal;
	onSelectFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

interface FolderGroup {
	folderPath: string;
	files: ChangesetFile[];
}

/**
 * Render a flat list of changed files grouped by their immediate parent
 * folder (one level deep — v1's "grouped" mode, not the full tree).
 *
 * Differences from v1's `FileListGrouped`:
 *  - Collapse state tracked as a *closed* set, so folders that newly appear
 *    in the changeset default to open (v1 tracked an *expanded* set keyed by
 *    folder path, so a folder that didn't exist on first render stayed
 *    collapsed when it appeared later).
 *  - Per-folder bulk Stage/Unstage/Discard intentionally not ported —
 *    section-level bulk actions already cover the common case, and the
 *    per-folder buttons crowd the header.
 */
export const ChangesFoldersView = memo(function ChangesFoldersView({
	files,
	workspaceId,
	worktreePath,
	foldSignal,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
}: ChangesFoldersViewProps) {
	const groups = useMemo(() => groupFilesByFolder(files), [files]);
	const [closedFolders, setClosedFolders] = useState<Set<string>>(new Set());

	const toggleFolder = useCallback((folderPath: string) => {
		setClosedFolders((prev) => {
			const next = new Set(prev);
			if (next.has(folderPath)) next.delete(folderPath);
			else next.add(folderPath);
			return next;
		});
	}, []);

	// React to expand-all / collapse-all from the toolbar — but only on a new
	// signal, not when `groups` changes (which would re-apply the last action
	// and stomp any folder the user re-toggled in between).
	const lastFoldEpochRef = useRef(0);
	useEffect(() => {
		if (foldSignal.epoch === 0 || foldSignal.epoch === lastFoldEpochRef.current)
			return;
		lastFoldEpochRef.current = foldSignal.epoch;
		setClosedFolders(
			foldSignal.action === "collapse"
				? new Set(groups.map((g) => g.folderPath))
				: new Set(),
		);
	}, [foldSignal, groups]);

	return (
		<div>
			{groups.map((group) => {
				const isRoot = group.folderPath === ROOT_FOLDER_KEY;
				const isOpen = !closedFolders.has(group.folderPath);
				// `folderPath` ("" for the root group) is already the unique
				// per-group discriminator — `groupFilesByFolder` keys a Map by it.
				return (
					<div key={group.folderPath}>
						<FolderHeader
							label={isRoot ? ROOT_FOLDER_LABEL : group.folderPath}
							fileCount={group.files.length}
							isOpen={isOpen}
							onToggle={() => toggleFolder(group.folderPath)}
						/>
						{isOpen &&
							group.files.map((file) => (
								<FileRow
									key={`${file.source.kind}:${file.path}`}
									file={file}
									workspaceId={workspaceId}
									worktreePath={worktreePath}
									hideDir
									onSelect={onSelectFile}
									onOpenFile={onOpenFile}
									onOpenInEditor={onOpenInEditor}
								/>
							))}
					</div>
				);
			})}
		</div>
	);
});

function groupFilesByFolder(files: ChangesetFile[]): FolderGroup[] {
	const map = new Map<string, ChangesetFile[]>();
	for (const file of files) {
		const lastSlash = file.path.lastIndexOf("/");
		const folderPath =
			lastSlash >= 0 ? file.path.slice(0, lastSlash) : ROOT_FOLDER_KEY;
		const group = map.get(folderPath);
		if (group) group.push(file);
		else map.set(folderPath, [file]);
	}
	return Array.from(map.entries())
		.map(([folderPath, groupFiles]) => ({
			folderPath,
			files: groupFiles.sort((a, b) =>
				basenameOf(a.path).localeCompare(basenameOf(b.path)),
			),
		}))
		.sort((a, b) => {
			// Root-level files come first so they read like the top of a tree.
			if (a.folderPath === ROOT_FOLDER_KEY)
				return b.folderPath === ROOT_FOLDER_KEY ? 0 : -1;
			if (b.folderPath === ROOT_FOLDER_KEY) return 1;
			return a.folderPath.localeCompare(b.folderPath);
		});
}

function basenameOf(path: string): string {
	const i = path.lastIndexOf("/");
	return i < 0 ? path : path.slice(i + 1);
}
