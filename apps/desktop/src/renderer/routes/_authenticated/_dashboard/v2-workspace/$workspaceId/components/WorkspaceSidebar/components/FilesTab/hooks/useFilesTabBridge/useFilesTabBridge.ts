import type { FileTree } from "@pierre/trees";
import { workspaceTrpc } from "@superset/workspace-client";
import type { FsWatchEvent } from "@superset/workspace-fs/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import type { TreeBookkeeping } from "../../utils/treeBookkeeping";
import { purgeDirectory, rekeyDirectory } from "../../utils/treeBookkeeping";
import {
	asDirectoryHandle,
	resolveDeleteTreePath,
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
	/**
	 * Surface a path in the tree without waiting for the fs watcher. Idempotent.
	 * Returns false if Pierre rejected it, in which case our bookkeeping is
	 * rolled back too — callers must not assume the row exists.
	 */
	addPath(treePath: string): boolean;
	/** Drop a path (and, for directories, its cached descendants) from the tree. */
	removePath(treePath: string): void;
	/** Lazy-load a directory's children into Pierre. Idempotent + dedup'd. */
	fetchDir(relDir: string): Promise<void>;
	/** Re-fetch every loaded directory and resetPaths so drift can't accumulate. */
	doRefresh(): Promise<void>;
	/**
	 * Rekey every descendant of `oldDir` to live under `newDir` in our
	 * bookkeeping. Call after a user-driven folder rename so subsequent
	 * fs:events / lookups don't target stale prefixes.
	 */
	rekeyDescendants(oldDir: string, newDir: string): void;
	/**
	 * Snapshot the current workspace version. Pair with `isCurrent(token)`
	 * around external awaits (e.g. tRPC mutations from FilesTab) so a
	 * workspace switch mid-flight can be detected and the post-await mutation
	 * skipped — same pattern fetchDir/doRefresh use internally.
	 */
	getVersion(): number;
	isCurrent(token: number): boolean;
	isRefreshing: boolean;
}

/**
 * Bridges Pierre's path-flat tree model to our lazy-loading useFileTree backend.
 *
 * Owns three pieces of mutable bookkeeping (mutated in place — never reassigned —
 * so consumers can hold references safely):
 *   - `knownPaths`: union of every path Pierre has been told about
 *   - `loadedDirs`: directories whose children we've already fetched
 *   - `unloadedDirCandidates`: known directories still awaiting a fetch
 *
 * All three are path-keyed, so a folder rename or removal invalidates every
 * entry beneath it at once. `purgeDirectory` / `rekeyDirectory` move them
 * together — see `utils/treeBookkeeping`.
 *
 * Drives four side-effects:
 *   - Initial load: fetch root on mount / workspace switch
 *   - Lazy expand: subscribe to `model` and fetch children of any directory
 *     that becomes expanded but isn't loaded yet
 *   - Live sync: apply fs:events (create / delete / rename / overflow) to the
 *     model + bookkeeping, falling back to a full refresh on overflow
 *   - Row removal: mirror Pierre's `remove` mutations into our bookkeeping
 *     (the Files tab's own cancel handling lives in useFilesTabActions)
 *
 * Async-listing races: every listing captures both the workspace version and a
 * tree revision. It aborts if the workspace changes or if a destructive tree
 * mutation (rename or removal) happens before the await resolves.
 */
export function useFilesTabBridge({
	model,
	workspaceId,
	rootPath,
}: UseFilesTabBridgeOptions): FilesTabBridge {
	const utils = workspaceTrpc.useUtils();
	const [isRefreshing, setIsRefreshing] = useState(false);

	// Sets/Maps are mutated in place (clear() on reset, never reassigned) so
	// consumers can read `bridge.knownPaths` once and trust the reference
	// across renders.
	const knownPathsRef = useRef(new Set<string>());
	const loadedDirsRef = useRef(new Set<string>());
	// Track in-flight loads as promises (not a Set) so concurrent callers
	// await the same fetch instead of short-circuiting. Pierre's `expand()`
	// notifies subscribers synchronously, and our model.subscribe hook fires
	// fetchDir before reveal's own `await fetchDir` runs — without shared
	// promises, reveal would resolve before children land in knownPaths.
	const inflightDirsRef = useRef(new Map<string, Promise<void>>());

	// Bumped on workspace/root change so async listings started against an
	// old workspace can detect they're stale and bail out before mutating.
	const versionRef = useRef(0);
	// Bumped on structural changes within the current workspace so a delayed
	// listing cannot restore paths that were renamed or removed after it began.
	const treeRevisionRef = useRef(0);

	// Track directories that are known but haven't been loaded yet. When
	// Pierre fires model.subscribe (on expansion, selection, etc.) we only
	// check these candidates instead of iterating the entire knownPaths set.
	const unloadedDirCandidatesRef = useRef(new Set<string>());

	// The three path-keyed sets always move together on a rename or removal, so
	// hand them to the helpers as one value rather than passing them separately
	// and risking one being forgotten.
	const bookkeeping = useCallback(
		(): TreeBookkeeping => ({
			knownPaths: knownPathsRef.current,
			loadedDirs: loadedDirsRef.current,
			unloadedDirCandidates: unloadedDirCandidatesRef.current,
		}),
		[],
	);

	const invalidateTreeListings = useCallback(() => {
		treeRevisionRef.current += 1;
	}, []);

	const fetchDir = useCallback(
		async function fetchDirectory(relDir: string): Promise<void> {
			if (!rootPath || !workspaceId) return;
			if (loadedDirsRef.current.has(relDir)) return;
			const existing = inflightDirsRef.current.get(relDir);
			if (existing) return existing;

			const startVersion = versionRef.current;
			const startTreeRevision = treeRevisionRef.current;
			let shouldRetry = false;
			const promise = (async () => {
				try {
					const result = await utils.filesystem.listDirectory.fetch({
						workspaceId,
						absolutePath: toAbs(rootPath, relDir),
					});
					if (
						versionRef.current !== startVersion ||
						treeRevisionRef.current !== startTreeRevision
					) {
						shouldRetry = versionRef.current === startVersion;
						return;
					}
					const ops: { type: "add"; path: string }[] = [];
					for (const entry of result.entries) {
						const rel = toRel(rootPath, entry.absolutePath);
						const treePath = entry.kind === "directory" ? `${rel}/` : rel;
						if (knownPathsRef.current.has(treePath)) continue;
						knownPathsRef.current.add(treePath);
						ops.push({ type: "add", path: treePath });
						// Register child directories as expansion candidates
						// so the subscriber can detect when they're expanded.
						if (entry.kind === "directory") {
							if (!loadedDirsRef.current.has(rel)) {
								unloadedDirCandidatesRef.current.add(rel);
							}
						}
					}
					if (ops.length > 0) model.batch(ops);
					loadedDirsRef.current.add(relDir);
					unloadedDirCandidatesRef.current.delete(relDir);
				} catch (error) {
					if (
						versionRef.current !== startVersion ||
						treeRevisionRef.current !== startTreeRevision
					) {
						shouldRetry = versionRef.current === startVersion;
						return;
					}
					console.error("[v2 FilesTab] listDirectory failed", {
						relDir,
						error,
					});
				}
			})();
			inflightDirsRef.current.set(relDir, promise);
			// Identity-check before deleting: on a workspace switch the map is
			// cleared and a new promise can be registered under the same key.
			// Without this guard, a late-resolving stale promise would evict
			// the live one and reopen duplicate fetches.
			void promise.finally(() => {
				if (inflightDirsRef.current.get(relDir) === promise) {
					inflightDirsRef.current.delete(relDir);
				}
				if (!shouldRetry || versionRef.current !== startVersion) return;
				// Root is always relevant. Nested directories are retried only when
				// they still exist at the same path and remain expanded; a renamed or
				// removed directory must not produce a request against its old path.
				if (relDir === "") {
					void fetchDirectory(relDir);
					return;
				}
				const dirKey = `${relDir}/`;
				if (!knownPathsRef.current.has(dirKey)) return;
				const handle = asDirectoryHandle(model.getItem(dirKey));
				if (handle?.isExpanded()) void fetchDirectory(relDir);
			});
			return promise;
		},
		[model, rootPath, workspaceId, utils.filesystem.listDirectory],
	);

	const doRefresh = useCallback(async (): Promise<void> => {
		if (!rootPath || !workspaceId) return;
		setIsRefreshing(true);
		const startVersion = versionRef.current;
		const startTreeRevision = treeRevisionRef.current;
		try {
			const dirsToReload = Array.from(loadedDirsRef.current).sort(
				(a, b) => a.split("/").length - b.split("/").length,
			);
			// Collect fresh listings into a flat set then resetPaths so what
			// Pierre shows can't drift from what we think we know. Keep the live
			// loaded-dir set untouched until commit so a stale refresh can abort
			// without partially clearing current bookkeeping.
			const freshPaths = new Set<string>();
			const freshLoadedDirs = new Set<string>();
			for (const dir of dirsToReload) {
				try {
					const result = await utils.filesystem.listDirectory.fetch(
						{ workspaceId, absolutePath: toAbs(rootPath, dir) },
						{ staleTime: 0 },
					);
					if (
						versionRef.current !== startVersion ||
						treeRevisionRef.current !== startTreeRevision
					) {
						return;
					}
					for (const entry of result.entries) {
						const rel = toRel(rootPath, entry.absolutePath);
						freshPaths.add(entry.kind === "directory" ? `${rel}/` : rel);
					}
					freshLoadedDirs.add(dir);
				} catch (error) {
					if (
						versionRef.current !== startVersion ||
						treeRevisionRef.current !== startTreeRevision
					) {
						return;
					}
					console.error("[v2 FilesTab] refresh listDirectory failed", {
						dir,
						error,
					});
				}
			}
			if (
				versionRef.current !== startVersion ||
				treeRevisionRef.current !== startTreeRevision
			) {
				return;
			}
			knownPathsRef.current.clear();
			loadedDirsRef.current.clear();
			unloadedDirCandidatesRef.current.clear();
			for (const dir of freshLoadedDirs) {
				loadedDirsRef.current.add(dir);
			}
			for (const path of freshPaths) {
				knownPathsRef.current.add(path);
				if (path.endsWith("/")) {
					const dirRel = stripTrailingSlash(path);
					if (!loadedDirsRef.current.has(dirRel)) {
						unloadedDirCandidatesRef.current.add(dirRel);
					}
				}
			}
			model.resetPaths(Array.from(freshPaths));
		} finally {
			setIsRefreshing(false);
		}
	}, [model, rootPath, workspaceId, utils.filesystem.listDirectory]);

	// Reset + initial load on workspace switch. Bumping versionRef invalidates
	// any in-flight fetches from the previous workspace.
	useEffect(() => {
		if (!rootPath || !workspaceId) return;
		versionRef.current += 1;
		invalidateTreeListings();
		knownPathsRef.current.clear();
		loadedDirsRef.current.clear();
		inflightDirsRef.current.clear();
		unloadedDirCandidatesRef.current.clear();
		model.resetPaths([]);
		void fetchDir("");
	}, [model, rootPath, workspaceId, fetchDir, invalidateTreeListings]);

	// On every model change, check only unloaded directory candidates for
	// expansion. Pierre doesn't surface an explicit "expand" event, so we
	// detect by checking expansion state on the (much smaller) candidate set
	// instead of iterating every known path. fetchDir removes the dir from
	// the candidate set on success.
	useEffect(() => {
		return model.subscribe(() => {
			for (const dirRel of unloadedDirCandidatesRef.current) {
				const dirKey = `${dirRel}/`;
				if (!knownPathsRef.current.has(dirKey)) continue;
				const handle = asDirectoryHandle(model.getItem(dirKey));
				if (handle?.isExpanded()) {
					void fetchDir(dirRel);
				}
			}
		});
	}, [model, fetchDir]);

	// Pierre fires a `remove` mutation when an inline rename is canceled with
	// `removeIfCanceled: true`. Mirror that into our bookkeeping so the row
	// doesn't ghost in knownPaths. (Renames that commit fire `move`, not
	// `remove` — those are handled in handleRename. Deleting the cancelled
	// entry from disk is useFilesTabActions' job, via its own `remove`
	// listener; Pierre supports several per mutation type.)
	useEffect(() => {
		return model.onMutation("remove", (event) => {
			invalidateTreeListings();
			knownPathsRef.current.delete(event.path);
			if (event.path.endsWith("/")) {
				const dir = stripTrailingSlash(event.path);
				loadedDirsRef.current.delete(dir);
				purgeDirectory(bookkeeping(), dir);
			}
		});
	}, [model, bookkeeping, invalidateTreeListings]);

	useWorkspaceEvent(
		"fs:events",
		workspaceId,
		(event: FsWatchEvent) => {
			if (import.meta.env.DEV) {
				console.log("[fs:debug] useFilesTabBridge recv", {
					kind: event.kind,
					path: event.absolutePath,
					oldPath: event.oldAbsolutePath,
					isDirectory: event.isDirectory,
				});
			}
			if (!rootPath) {
				if (import.meta.env.DEV) {
					console.log(
						"[fs:debug] drop: rootPath empty (subscription should be gated)",
					);
				}
				return;
			}
			if (event.kind === "overflow") {
				void doRefresh();
				return;
			}

			const rel = toRel(rootPath, event.absolutePath);
			if (rel === event.absolutePath && event.absolutePath !== rootPath) {
				if (import.meta.env.DEV) {
					console.log("[fs:debug] drop: outside workspace", {
						path: event.absolutePath,
						rootPath,
					});
				}
				return;
			}

			if (event.kind === "rename" && event.oldAbsolutePath) {
				invalidateTreeListings();
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
							const oldDir = stripTrailingSlash(oldKey);
							const newDir = stripTrailingSlash(newKey);
							rekeyDirectory(bookkeeping(), oldDir, newDir);
						}
					} catch {
						// Pierre rejected the move — fall back to remove + add.
						removeKnownPath(model, knownPathsRef.current, oldKey);
						if (isFolder) {
							purgeDirectory(bookkeeping(), stripTrailingSlash(oldKey));
						}
						addKnownPath(model, knownPathsRef.current, newKey);
					}
				} else {
					if (import.meta.env.DEV) {
						console.log(
							"[fs:debug] rename fallback: oldKey not in knownPaths, treating as create",
							{
								oldRel,
								newKey,
							},
						);
					}
					addKnownPath(model, knownPathsRef.current, newKey);
				}
				if (isFolder) {
					const newDir = stripTrailingSlash(newKey);
					if (!loadedDirsRef.current.has(newDir)) {
						unloadedDirCandidatesRef.current.add(newDir);
					}
					const handle = asDirectoryHandle(model.getItem(newKey));
					if (handle?.isExpanded()) void fetchDir(newDir);
				}
				return;
			}

			if (event.kind === "delete") {
				invalidateTreeListings();
				const { treePath: matched, isDirectory } = resolveDeleteTreePath(
					knownPathsRef.current,
					rel,
					event.isDirectory,
				);
				removeKnownPath(model, knownPathsRef.current, matched);
				if (isDirectory) {
					purgeDirectory(bookkeeping(), stripTrailingSlash(matched));
				}
				return;
			}

			if (event.kind === "create") {
				const isFolder = event.isDirectory ?? false;
				const key = isFolder ? `${rel}/` : rel;
				addKnownPath(model, knownPathsRef.current, key);
				if (isFolder && !loadedDirsRef.current.has(rel)) {
					unloadedDirCandidatesRef.current.add(rel);
				}
				return;
			}

			// "update" doesn't change tree shape.
		},
		Boolean(workspaceId && rootPath),
	);

	const rekeyDescendantsBound = useCallback(
		(oldDir: string, newDir: string) => {
			invalidateTreeListings();
			rekeyDirectory(bookkeeping(), oldDir, newDir);
			const newKey = `${newDir}/`;
			const handle = asDirectoryHandle(model.getItem(newKey));
			if (handle?.isExpanded()) void fetchDir(newDir);
		},
		[bookkeeping, fetchDir, invalidateTreeListings, model],
	);

	const getVersion = useCallback(() => versionRef.current, []);
	const isCurrent = useCallback(
		(token: number) => versionRef.current === token,
		[],
	);

	const addPath = useCallback(
		(treePath: string): boolean => {
			if (!knownPathsRef.current.has(treePath)) {
				knownPathsRef.current.add(treePath);
				try {
					model.add(treePath);
				} catch {
					// Pierre refused the path. Roll our bookkeeping back rather than
					// claiming to know a row the tree doesn't have.
					knownPathsRef.current.delete(treePath);
					return false;
				}
			}
			// A new directory still needs to lazy-load when the user expands it.
			if (treePath.endsWith("/")) {
				const dirRel = stripTrailingSlash(treePath);
				if (!loadedDirsRef.current.has(dirRel)) {
					unloadedDirCandidatesRef.current.add(dirRel);
				}
			}
			return true;
		},
		[model],
	);

	const removePath = useCallback(
		(treePath: string): void => {
			if (knownPathsRef.current.has(treePath)) {
				invalidateTreeListings();
			}
			removeKnownPath(model, knownPathsRef.current, treePath);
			if (treePath.endsWith("/")) {
				const dirRel = stripTrailingSlash(treePath);
				loadedDirsRef.current.delete(dirRel);
				unloadedDirCandidatesRef.current.delete(dirRel);
				purgeDirectory(bookkeeping(), dirRel);
			}
		},
		[model, bookkeeping, invalidateTreeListings],
	);

	return {
		knownPaths: knownPathsRef.current,
		loadedDirs: loadedDirsRef.current,
		addPath,
		removePath,
		fetchDir,
		doRefresh,
		rekeyDescendants: rekeyDescendantsBound,
		getVersion,
		isCurrent,
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
