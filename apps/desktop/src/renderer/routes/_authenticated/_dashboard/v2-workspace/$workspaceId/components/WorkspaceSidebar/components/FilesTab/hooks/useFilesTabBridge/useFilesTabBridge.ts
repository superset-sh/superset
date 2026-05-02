import type { FileTree } from "@pierre/trees";
import { workspaceTrpc } from "@superset/workspace-client";
import type { FsWatchEvent } from "@superset/workspace-fs/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import {
	asDirectoryHandle,
	stripTrailingSlash,
	toAbs,
	toRel,
} from "../../utils/treePath";

interface UseFilesTabBridgeOptions {
	model: FileTree;
	workspaceId: string;
	rootPath: string;
}

export interface FilesTabBridge {
	/** Tree paths Pierre knows about. Files: bare path; directories: trailing slash. */
	knownPaths: Set<string>;
	/** Relative directory paths whose children we've fetched. "" = root. */
	loadedDirs: Set<string>;
	/** Placeholder paths created via "New File/Folder", awaiting rename commit. */
	pendingCreates: Map<string, "file" | "folder">;
	/** Lazy-load a directory's children into Pierre. Idempotent + dedup'd. */
	fetchDir(relDir: string): Promise<void>;
	/** Re-fetch every loaded directory and resetPaths so drift can't accumulate. */
	doRefresh(): Promise<void>;
	isRefreshing: boolean;
}

/**
 * Bridges Pierre's path-flat tree model to our lazy-loading useFileTree backend.
 *
 * Owns three pieces of mutable bookkeeping:
 *   - `knownPaths`: union of every path Pierre has been told about
 *   - `loadedDirs`: directories whose children we've already fetched
 *   - `pendingCreates`: placeholder paths from the inline "New" flow
 *
 * Drives three side-effects:
 *   - Initial load: fetch root on mount / workspace switch
 *   - Lazy expand: subscribe to `model` and fetch children of any directory
 *     that becomes expanded but isn't loaded yet
 *   - Live sync: apply fs:events (create / delete / rename / overflow) to the
 *     model + bookkeeping, falling back to a full refresh on overflow
 */
export function useFilesTabBridge({
	model,
	workspaceId,
	rootPath,
}: UseFilesTabBridgeOptions): FilesTabBridge {
	const utils = workspaceTrpc.useUtils();
	const [isRefreshing, setIsRefreshing] = useState(false);

	const knownPathsRef = useRef(new Set<string>());
	const loadedDirsRef = useRef(new Set<string>());
	const loadingDirsRef = useRef(new Set<string>());
	const pendingCreatesRef = useRef(new Map<string, "file" | "folder">());

	const fetchDir = useCallback(
		async (relDir: string): Promise<void> => {
			if (!rootPath || !workspaceId) return;
			if (loadingDirsRef.current.has(relDir)) return;
			if (loadedDirsRef.current.has(relDir)) return;
			loadingDirsRef.current.add(relDir);
			try {
				const result = await utils.filesystem.listDirectory.fetch({
					workspaceId,
					absolutePath: toAbs(rootPath, relDir),
				});
				const ops: { type: "add"; path: string }[] = [];
				for (const entry of result.entries) {
					const rel = toRel(rootPath, entry.absolutePath);
					const treePath = entry.kind === "directory" ? `${rel}/` : rel;
					if (knownPathsRef.current.has(treePath)) continue;
					knownPathsRef.current.add(treePath);
					ops.push({ type: "add", path: treePath });
				}
				if (ops.length > 0) model.batch(ops);
				loadedDirsRef.current.add(relDir);
			} catch (error) {
				console.error("[v2 FilesTab] listDirectory failed", { relDir, error });
			} finally {
				loadingDirsRef.current.delete(relDir);
			}
		},
		[model, rootPath, workspaceId, utils.filesystem.listDirectory],
	);

	const doRefresh = useCallback(async (): Promise<void> => {
		if (!rootPath || !workspaceId) return;
		setIsRefreshing(true);
		try {
			const dirsToReload = Array.from(loadedDirsRef.current).sort(
				(a, b) => a.split("/").length - b.split("/").length,
			);
			loadedDirsRef.current = new Set();

			// Collect fresh listings into a flat set then resetPaths so what
			// Pierre shows can't drift from what we think we know.
			const freshPaths = new Set<string>();
			for (const dir of dirsToReload) {
				try {
					const result = await utils.filesystem.listDirectory.fetch(
						{ workspaceId, absolutePath: toAbs(rootPath, dir) },
						{ staleTime: 0 },
					);
					for (const entry of result.entries) {
						const rel = toRel(rootPath, entry.absolutePath);
						freshPaths.add(entry.kind === "directory" ? `${rel}/` : rel);
					}
					loadedDirsRef.current.add(dir);
				} catch (error) {
					console.error("[v2 FilesTab] refresh listDirectory failed", {
						dir,
						error,
					});
				}
			}
			knownPathsRef.current = freshPaths;
			model.resetPaths(Array.from(freshPaths));
		} finally {
			setIsRefreshing(false);
		}
	}, [model, rootPath, workspaceId, utils.filesystem.listDirectory]);

	// Reset + initial load on workspace switch.
	useEffect(() => {
		if (!rootPath || !workspaceId) return;
		knownPathsRef.current = new Set();
		loadedDirsRef.current = new Set();
		loadingDirsRef.current = new Set();
		pendingCreatesRef.current = new Map();
		model.resetPaths([]);
		void fetchDir("");
	}, [model, rootPath, workspaceId, fetchDir]);

	// On every model change, scan known directories and lazy-load any newly
	// expanded ones. Pierre doesn't surface an explicit "expand" event, so we
	// detect by polling expansion state through getItem on each notify.
	useEffect(() => {
		return model.subscribe(() => {
			for (const path of knownPathsRef.current) {
				if (!path.endsWith("/")) continue;
				const dirRel = stripTrailingSlash(path);
				if (loadedDirsRef.current.has(dirRel)) continue;
				const handle = asDirectoryHandle(model.getItem(path));
				if (handle?.isExpanded()) {
					void fetchDir(dirRel);
				}
			}
		});
	}, [model, fetchDir]);

	useWorkspaceEvent(
		"fs:events",
		workspaceId,
		(event: FsWatchEvent) => {
			if (!rootPath) return;
			if (event.kind === "overflow") {
				void doRefresh();
				return;
			}

			const rel = toRel(rootPath, event.absolutePath);
			if (rel === event.absolutePath && event.absolutePath !== rootPath) {
				return; // outside workspace
			}

			if (event.kind === "rename" && event.oldAbsolutePath) {
				const oldRel = toRel(rootPath, event.oldAbsolutePath);
				const oldKey = matchKnown(knownPathsRef.current, oldRel);
				const isFolder = event.isDirectory ?? oldKey?.endsWith("/") ?? false;
				const newKey = isFolder ? `${rel}/` : rel;
				if (oldKey && knownPathsRef.current.has(oldKey)) {
					try {
						model.move(oldKey, newKey);
						knownPathsRef.current.delete(oldKey);
						knownPathsRef.current.add(newKey);
						if (isFolder) {
							loadedDirsRef.current.delete(stripTrailingSlash(oldKey));
						}
					} catch {
						// Pierre rejected the move — fall back to remove + add.
						removeKnownPath(model, knownPathsRef.current, oldKey);
						addKnownPath(model, knownPathsRef.current, newKey);
					}
				} else {
					addKnownPath(model, knownPathsRef.current, newKey);
				}
				return;
			}

			if (event.kind === "delete") {
				const isFolder = event.isDirectory ?? false;
				const key = isFolder ? `${rel}/` : rel;
				const matched = matchKnown(knownPathsRef.current, rel) ?? key;
				removeKnownPath(model, knownPathsRef.current, matched);
				if (isFolder) {
					loadedDirsRef.current.delete(stripTrailingSlash(matched));
				}
				return;
			}

			if (event.kind === "create") {
				const isFolder = event.isDirectory ?? false;
				const key = isFolder ? `${rel}/` : rel;
				addKnownPath(model, knownPathsRef.current, key);
				return;
			}

			// "update" doesn't change tree shape.
		},
		Boolean(workspaceId && rootPath),
	);

	return {
		knownPaths: knownPathsRef.current,
		loadedDirs: loadedDirsRef.current,
		pendingCreates: pendingCreatesRef.current,
		fetchDir,
		doRefresh,
		isRefreshing,
	};
}

function matchKnown(known: Set<string>, rel: string): string | undefined {
	if (known.has(rel)) return rel;
	const dirKey = `${rel}/`;
	if (known.has(dirKey)) return dirKey;
	return undefined;
}

function addKnownPath(
	model: { add: (p: string) => void },
	known: Set<string>,
	path: string,
): void {
	if (known.has(path)) return;
	known.add(path);
	try {
		model.add(path);
	} catch {
		// Pierre may reject duplicates — ignore.
	}
}

function removeKnownPath(
	model: { remove: (p: string, options?: { recursive?: boolean }) => void },
	known: Set<string>,
	path: string,
): void {
	if (!known.has(path)) return;
	known.delete(path);
	try {
		model.remove(path, { recursive: true });
	} catch {
		// ignore
	}
}
