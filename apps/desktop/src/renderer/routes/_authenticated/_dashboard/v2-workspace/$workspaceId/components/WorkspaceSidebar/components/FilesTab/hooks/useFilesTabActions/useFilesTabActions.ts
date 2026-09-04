import { useLingui } from "@lingui/react/macro";
import type { FileTree, FileTreeRenameEvent } from "@pierre/trees";
import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useEffect, useRef } from "react";
import { canonicalizeTreePath } from "renderer/lib/pierreTree";
import { FILE_EXPLORER_ROW_HEIGHT } from "../../constants";
import {
	buildCreationKey,
	CREATION_BASE_NAME,
	deriveCreationParent,
} from "../../utils/creationPaths";
import type {
	ProvisionalEntry,
	ProvisionalEvent,
} from "../../utils/provisionalEntry";
import { reduceProvisional } from "../../utils/provisionalEntry";
import { scrollTreeToRow } from "../../utils/scrollTreeToRow";
import {
	asDirectoryHandle,
	parentRel,
	stripTrailingSlash,
	toAbs,
	toRel,
} from "../../utils/treePath";
import type { FilesTabBridge } from "../useFilesTabBridge";

interface UseFilesTabActionsOptions {
	model: FileTree;
	bridge: FilesTabBridge;
	/** Workspace worktree root (absolute). */
	rootPath: string;
	workspaceId: string;
}

export interface FilesTabActions {
	/** Expand every ancestor directory of `absolutePath` then scroll the row into view. */
	reveal(absolutePath: string, isDirectory: boolean): Promise<void>;
	/** Create a file/folder on disk, then open the inline rename on it. */
	startCreating(mode: "file" | "folder", parentAbs?: string): Promise<void>;
	/** Commit a Pierre rename event by moving the entry on disk. */
	handleRename(event: FileTreeRenameEvent): Promise<void>;
	/** Surface a name Pierre rejected and stand the creation flow down. */
	handleRenameError(message: string): void;
	/** Confirm + delete a file/folder. */
	handleDelete(absolutePath: string, name: string, isDirectory: boolean): void;
	/** Collapse every expanded directory in the tree. */
	collapseAll(): void;
}

/**
 * Filesystem-mutating actions for the Files tab: create / rename / delete /
 * reveal / collapse-all. Owns the tRPC mutations and the bridge bookkeeping
 * dance (optimistic Pierre updates + workspace-switch race guards) so
 * `FilesTab` itself stays focused on wiring the tree.
 *
 * Creation writes to disk *before* opening the inline rename, so what the user
 * names is a real entry and every commit is an ordinary rename. The alternative
 * — a purely in-memory placeholder finalized on commit — cannot work here:
 * Pierre emits no callback at all when a rename commits unchanged, so accepting
 * the default name would silently create nothing and strand a row for a file
 * that does not exist.
 */
export function useFilesTabActions({
	model,
	bridge,
	rootPath,
	workspaceId,
}: UseFilesTabActionsOptions): FilesTabActions {
	const { t } = useLingui();
	const createUniqueEntry =
		workspaceTrpc.filesystem.createUniqueEntry.useMutation();
	const removeEmptyDirectory =
		workspaceTrpc.filesystem.removeEmptyDirectory.useMutation();
	const removeFileIfUnchanged =
		workspaceTrpc.filesystem.removeFileIfUnchanged.useMutation();
	const movePath = workspaceTrpc.filesystem.movePath.useMutation();
	const deletePath = workspaceTrpc.filesystem.deletePath.useMutation();

	// The entry the user is naming right now, if any. A ref (not state) because
	// Pierre's callbacks fire outside React's render cycle and every consumer
	// reads it imperatively.
	const provisionalRef = useRef<ProvisionalEntry | null>(null);
	/** `workspaceId:rootPath` the provisional entry above belongs to. */
	const provisionalWorkspaceRef = useRef<string>("");

	const reveal = useCallback(
		async (absolutePath: string, isDirectory: boolean): Promise<void> => {
			if (!rootPath || !absolutePath.startsWith(rootPath)) return;
			const rel = toRel(rootPath, absolutePath);
			if (!rel) return;

			// Always wait on the root listing before focusPath. For root-level
			// files the ancestor loop runs zero iterations, so without this
			// we'd race the initial fetch and the reveal silently no-ops.
			// fetchDir is idempotent + cached, so this is free after first call.
			await bridge.fetchDir("");

			const segments = rel.split("/");
			let acc = "";
			for (let i = 0; i < segments.length - 1; i++) {
				acc = acc ? `${acc}/${segments[i]}` : segments[i];
				const dirKey = `${acc}/`;
				if (!bridge.knownPaths.has(dirKey)) {
					// Ancestor not loaded yet — load its parent then expand.
					await bridge.fetchDir(parentRel(acc));
				}
				const handle = asDirectoryHandle(model.getItem(dirKey));
				if (handle && !handle.isExpanded()) {
					handle.expand();
					await bridge.fetchDir(acc);
				}
			}
			if (isDirectory) {
				const dirKey = `${rel}/`;
				const handle = asDirectoryHandle(model.getItem(dirKey));
				if (handle && !handle.isExpanded()) {
					handle.expand();
					await bridge.fetchDir(rel);
				}
			}

			requestAnimationFrame(() => {
				// Visual row highlight comes from `data-item-selected`, not focus.
				// FileTree's public API doesn't expose selectOnlyPath, so emulate
				// it via deselect-then-select on the item handles. Pierre uses
				// trailing-slash keys for directories. Empty-selection emissions
				// between deselect and select are filtered out by FilesTab's
				// onSelectionChange handler (it ignores `last === undefined`,
				// and folder-shaped paths get skipped before onSelectFile).
				const targetKey = isDirectory ? `${rel}/` : rel;
				for (const selectedPath of model.getSelectedPaths()) {
					if (selectedPath === targetKey) continue;
					model.getItem(selectedPath)?.deselect();
				}
				model.getItem(targetKey)?.select();
				model.focusPath(rel);

				scrollTreeToRow(
					model,
					bridge.knownPaths,
					targetKey,
					FILE_EXPLORER_ROW_HEIGHT,
				);
			});
		},
		[model, rootPath, bridge.fetchDir, bridge.knownPaths],
	);

	/**
	 * Undo a provisional entry on disk. Returns false when the entry was left
	 * alone because it is no longer the empty thing we created — the caller then
	 * has to put its row back rather than pretend it is gone.
	 */
	const discardProvisional = useCallback(
		async (entry: ProvisionalEntry): Promise<boolean> => {
			if (entry.mode === "folder") {
				const result = await removeEmptyDirectory.mutateAsync({
					workspaceId,
					absolutePath: entry.absolutePath,
				});
				return result.ok;
			}
			// Nothing to compare against; leave it rather than risk the wrong file.
			if (entry.revision === undefined) return false;
			const result = await removeFileIfUnchanged.mutateAsync({
				workspaceId,
				absolutePath: entry.absolutePath,
				revision: entry.revision,
			});
			return result.ok;
		},
		[workspaceId, removeEmptyDirectory, removeFileIfUnchanged],
	);

	const dispatchProvisional = useCallback(
		(event: ProvisionalEvent): void => {
			const { state, action } = reduceProvisional(
				provisionalRef.current,
				event,
			);
			provisionalRef.current = state;

			if (action.type !== "cleanup") return;

			const { entry } = action;
			void discardProvisional(entry)
				.then((removed) => {
					if (removed || !bridge.isCurrent(entry.versionToken)) return;
					// Still on disk — restore the row so the tree matches reality.
					bridge.addPath(entry.key);
					toast.info(
						entry.mode === "folder"
							? t({
									message: "Kept the new folder — it is no longer empty",
								})
							: t({
									message:
										"Kept the new file — it changed after it was created",
								}),
					);
				})
				.catch((error) => {
					if (!bridge.isCurrent(entry.versionToken)) return;
					bridge.addPath(entry.key);
					toast.error(
						t({
							message: "Failed to discard the new item",
						}),
						{
							description: error instanceof Error ? error.message : undefined,
						},
					);
				});
		},
		[bridge, discardProvisional, t],
	);

	const startCreating = useCallback(
		async (mode: "file" | "folder", parentAbs?: string): Promise<void> => {
			if (!rootPath) return;
			// Read the selection at click time, not render time — the user may have
			// changed it since the last render.
			const parentAbsPath =
				parentAbs ??
				deriveCreationParent(
					model.getSelectedPaths(),
					bridge.knownPaths,
					rootPath,
				);
			const parentRelPath = toRel(rootPath, parentAbsPath);
			const parentDirKey = parentRelPath ? `${parentRelPath}/` : "";
			const versionToken = bridge.getVersion();

			// Make sure Pierre has the parent's children loaded + expanded so
			// the new row appears in the right place.
			if (parentRelPath) {
				await bridge.fetchDir(parentRelPath);
				if (!bridge.isCurrent(versionToken)) return;
				const handle = asDirectoryHandle(model.getItem(parentDirKey));
				if (handle && !handle.isExpanded()) {
					handle.expand();
				}
			}

			// The host picks the actual name: it retries Untitled-2, Untitled-3, ...
			// against the filesystem, so a listing we haven't refreshed can't make us
			// collide with — or worse, adopt — an entry that already exists.
			let created: Awaited<ReturnType<typeof createUniqueEntry.mutateAsync>>;
			try {
				created = await createUniqueEntry.mutateAsync({
					workspaceId,
					parentAbsolutePath: parentAbsPath,
					baseName: CREATION_BASE_NAME[mode],
					kind: mode === "folder" ? "directory" : "file",
				});
			} catch (error) {
				if (!bridge.isCurrent(versionToken)) return;
				toast.error(
					t({
						message: "Failed to create item",
					}),
					{
						description: error instanceof Error ? error.message : undefined,
					},
				);
				return;
			}

			if (!created.ok) {
				if (!bridge.isCurrent(versionToken)) return;
				toast.error(
					t({
						message: "Failed to create item",
					}),
					{
						description:
							created.reason === "exhausted"
								? t({
										message: "Too many untitled items here already.",
									})
								: t({
										message: "That name isn't allowed.",
									}),
					},
				);
				return;
			}

			const entry: ProvisionalEntry = {
				key: buildCreationKey(parentRelPath, created.name, mode),
				absolutePath: created.absolutePath,
				mode,
				revision: created.revision,
				rootPath,
				versionToken,
			};

			// The user moved on mid-flight; take the entry back out rather than
			// leaving it behind in a workspace they're no longer looking at.
			if (!bridge.isCurrent(versionToken)) {
				void discardProvisional(entry).catch(() => {
					// Nothing useful to surface — the workspace is gone from view.
				});
				return;
			}

			// Show it now instead of waiting on the fs watcher's debounce.
			if (!bridge.addPath(entry.key)) {
				void discardProvisional(entry).catch(() => {});
				toast.error(
					t({
						message: "Failed to create item",
					}),
				);
				return;
			}

			if (!model.startRenaming(entry.key, { removeIfCanceled: true })) {
				void discardProvisional(entry).catch(() => {});
				bridge.removePath(entry.key);
				toast.error(
					t({
						message: "Failed to create item",
					}),
				);
				return;
			}

			// A new file opens in the editor, but we deliberately don't call
			// onSelectFile here: startRenaming selects the row, which emits
			// onSelectionChange, which already opens it. Opening twice would hit
			// openFilePaneFromTreeClick's "clicked the active row" branch and pin
			// the pane — so cancelling would delete the file and strand a pinned
			// pane pointing at it.
			dispatchProvisional({ type: "created", entry });
		},
		[
			model,
			rootPath,
			workspaceId,
			bridge,
			createUniqueEntry,
			discardProvisional,
			dispatchProvisional,
			t,
		],
	);

	// Pierre fires `remove` when an inline rename is cancelled with
	// removeIfCanceled. Because we created the entry up front, cancelling has to
	// take it back off disk — but only if it is still our own provisional entry
	// (see reduceProvisional).
	useEffect(() => {
		return model.onMutation("remove", (event) => {
			dispatchProvisional({
				type: "removed",
				path: event.path,
				rootPath,
				versionToken: bridge.getVersion(),
			});
		});
	}, [model, rootPath, bridge, dispatchProvisional]);

	// A provisional entry belongs to the workspace it was created in. Drop the
	// bookkeeping on a switch without deleting anything — it exists on disk and
	// the user may come back to it.
	//
	// Guarded on the identity rather than firing whenever the effect re-runs:
	// `dispatchProvisional` changes identity as its own dependencies change, and
	// an unguarded reset would clear the entry out from under a user who is
	// still typing its name.
	useEffect(() => {
		const identity = `${workspaceId}:${rootPath}`;
		if (provisionalWorkspaceRef.current === identity) return;
		provisionalWorkspaceRef.current = identity;
		dispatchProvisional({ type: "workspace-changed" });
	}, [workspaceId, rootPath, dispatchProvisional]);

	const handleRename = useCallback(
		async (event: FileTreeRenameEvent): Promise<void> => {
			if (!rootPath) return;
			const { isFolder } = event;
			// Pierre reports slash-less paths on this event even when isFolder is
			// true, while its model and our knownPaths key directories WITH a
			// trailing slash. Canonicalize once, here, so nothing downstream can
			// look a directory up under the wrong key.
			const sourcePath = canonicalizeTreePath(event.sourcePath, isFolder);
			const destinationPath = canonicalizeTreePath(
				event.destinationPath,
				isFolder,
			);

			// Committed under a real name — it isn't provisional any more.
			dispatchProvisional({ type: "renamed", sourceKey: sourcePath });

			// Snapshot before any await so post-mutation cleanup against a
			// stale workspace (user switched mid-flight) bails out instead of
			// leaking source/destination paths into the new workspace's
			// knownPaths / model.
			const versionToken = bridge.getVersion();

			// Every commit is an ordinary rename: the entry already exists on disk,
			// created before the inline rename opened. Pierre has already moved it
			// on its side. For folders, also rekey every cached descendant
			// (knownPaths + loadedDirs) under the new prefix so later fs
			// reconciliation / reveals don't target stale paths.
			bridge.knownPaths.delete(sourcePath);
			bridge.knownPaths.add(destinationPath);
			if (isFolder) {
				bridge.rekeyDescendants(
					stripTrailingSlash(sourcePath),
					stripTrailingSlash(destinationPath),
				);
			}
			try {
				await movePath.mutateAsync({
					workspaceId,
					sourceAbsolutePath: toAbs(rootPath, sourcePath),
					destinationAbsolutePath: toAbs(rootPath, destinationPath),
				});
			} catch (error) {
				if (!bridge.isCurrent(versionToken)) return;
				// Revert Pierre's optimistic rename.
				try {
					model.move(destinationPath, sourcePath);
					bridge.knownPaths.delete(destinationPath);
					bridge.knownPaths.add(sourcePath);
					if (isFolder) {
						bridge.rekeyDescendants(
							stripTrailingSlash(destinationPath),
							stripTrailingSlash(sourcePath),
						);
					}
				} catch {
					// ignore — fs:events will reconcile
				}
				toast.error(
					t({
						message: "Failed to rename",
					}),
					{
						description: error instanceof Error ? error.message : undefined,
					},
				);
			}
		},
		[model, rootPath, workspaceId, movePath, bridge, dispatchProvisional, t],
	);

	const handleRenameError = useCallback(
		(message: string): void => {
			toast.error(message);
			// Pierre has already ended the rename session. The entry keeps its
			// current name on disk, so it stays usable — see reduceProvisional's
			// `rename-error` case for why we don't reopen the inline rename.
			dispatchProvisional({ type: "rename-error" });
		},
		[dispatchProvisional],
	);

	const handleDelete = useCallback(
		(absolutePath: string, name: string, isDirectory: boolean): void => {
			alert({
				title: t({
					message: `Delete ${name}?`,
				}),
				description: isDirectory
					? t({
							message:
								"Are you sure you want to delete this folder? This action cannot be undone.",
						})
					: t({
							message:
								"Are you sure you want to delete this file? This action cannot be undone.",
						}),
				actions: [
					{
						label: t({
							message: "Delete",
						}),
						variant: "destructive",
						onClick: () => {
							toast.promise(
								deletePath.mutateAsync({ workspaceId, absolutePath }),
								{
									loading: t({
										message: `Deleting ${name}...`,
									}),
									success: t({
										message: `Deleted ${name}`,
									}),
									error: t({
										message: `Failed to delete ${name}`,
									}),
								},
							);
						},
					},
					{
						label: t({
							message: "Cancel",
						}),
						variant: "ghost",
					},
				],
			});
		},
		[workspaceId, deletePath, t],
	);

	const collapseAll = useCallback(() => {
		for (const path of bridge.knownPaths) {
			if (!path.endsWith("/")) continue;
			const handle = asDirectoryHandle(model.getItem(path));
			if (handle?.isExpanded()) {
				handle.collapse();
			}
		}
	}, [model, bridge.knownPaths]);

	return {
		reveal,
		startCreating,
		handleRename,
		handleRenameError,
		handleDelete,
		collapseAll,
	};
}
