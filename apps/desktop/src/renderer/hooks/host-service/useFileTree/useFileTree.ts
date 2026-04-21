import { workspaceTrpc } from "@superset/workspace-client";
import type { FsEntry, FsEntryKind } from "@superset/workspace-fs/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceEvent } from "../useWorkspaceEvent";

export interface FileTreeNode {
	absolutePath: string;
	kind: FsEntryKind;
	name: string;
	relativePath: string;
	isExpanded: boolean;
	isLoading: boolean;
	children: FileTreeNode[];
}

export interface UseFileTreeParams {
	workspaceId: string;
	rootPath: string;
	persistKey?: string;
}

export interface UseFileTreeResult {
	isLoadingRoot: boolean;
	collapseAll: () => void;
	rootEntries: FileTreeNode[];
	expand: (path: string) => Promise<void>;
	collapse: (path: string) => void;
	toggle: (path: string) => Promise<void>;
	refreshAll: () => Promise<void>;
	refreshPath: (path: string) => Promise<void>;
	reveal: (path: string, options?: { isDirectory?: boolean }) => Promise<void>;
}

interface FileTreeState {
	childPathsByDirectory: Map<string, string[]>;
	entriesByPath: Map<string, FsEntry>;
	expandedDirectories: Set<string>;
	invalidatedDirectories: Set<string>;
	loadedDirectories: Set<string>;
	loadingDirectories: Set<string>;
}

function createInitialState(): FileTreeState {
	return {
		childPathsByDirectory: new Map<string, string[]>(),
		entriesByPath: new Map<string, FsEntry>(),
		expandedDirectories: new Set<string>(),
		invalidatedDirectories: new Set<string>(),
		loadedDirectories: new Set<string>(),
		loadingDirectories: new Set<string>(),
	};
}

function getParentPath(absolutePath: string): string {
	const trimmedPath = absolutePath.replace(/[\\/]+$/, "");
	const lastSeparatorIndex = Math.max(
		trimmedPath.lastIndexOf("/"),
		trimmedPath.lastIndexOf("\\"),
	);

	if (lastSeparatorIndex <= 0) {
		return trimmedPath;
	}

	if (/^[A-Za-z]:$/.test(trimmedPath.slice(0, lastSeparatorIndex))) {
		return `${trimmedPath.slice(0, lastSeparatorIndex)}\\`;
	}

	return trimmedPath.slice(0, lastSeparatorIndex);
}

function getRelativePath(rootPath: string, absolutePath: string): string {
	if (absolutePath === rootPath) {
		return "";
	}

	if (absolutePath.startsWith(`${rootPath}/`)) {
		return absolutePath.slice(rootPath.length + 1);
	}

	if (absolutePath.startsWith(`${rootPath}\\`)) {
		return absolutePath.slice(rootPath.length + 1);
	}

	return absolutePath;
}

function isWithinPath(rootPath: string, absolutePath: string): boolean {
	return (
		absolutePath === rootPath ||
		absolutePath.startsWith(`${rootPath}/`) ||
		absolutePath.startsWith(`${rootPath}\\`)
	);
}

function deleteSubtree(
	state: FileTreeState,
	absolutePath: string,
): FileTreeState {
	const nextEntries = new Map(state.entriesByPath);
	const nextChildren = new Map(state.childPathsByDirectory);
	const nextExpanded = new Set(state.expandedDirectories);
	const nextLoaded = new Set(state.loadedDirectories);
	const nextInvalidated = new Set(state.invalidatedDirectories);
	const nextLoading = new Set(state.loadingDirectories);

	for (const path of nextEntries.keys()) {
		if (isWithinPath(absolutePath, path)) {
			nextEntries.delete(path);
		}
	}

	for (const path of nextChildren.keys()) {
		if (isWithinPath(absolutePath, path)) {
			nextChildren.delete(path);
		}
	}

	for (const path of Array.from(nextExpanded)) {
		if (isWithinPath(absolutePath, path)) {
			nextExpanded.delete(path);
		}
	}

	for (const path of Array.from(nextLoaded)) {
		if (isWithinPath(absolutePath, path)) {
			nextLoaded.delete(path);
		}
	}

	for (const path of Array.from(nextInvalidated)) {
		if (isWithinPath(absolutePath, path)) {
			nextInvalidated.delete(path);
		}
	}

	for (const path of Array.from(nextLoading)) {
		if (isWithinPath(absolutePath, path)) {
			nextLoading.delete(path);
		}
	}

	return {
		childPathsByDirectory: nextChildren,
		entriesByPath: nextEntries,
		expandedDirectories: nextExpanded,
		invalidatedDirectories: nextInvalidated,
		loadedDirectories: nextLoaded,
		loadingDirectories: nextLoading,
	};
}

function retargetPath(path: string, fromPath: string, toPath: string): string {
	if (path === fromPath) {
		return toPath;
	}

	if (path.startsWith(`${fromPath}/`)) {
		return `${toPath}${path.slice(fromPath.length)}`;
	}

	if (path.startsWith(`${fromPath}\\`)) {
		return `${toPath}${path.slice(fromPath.length)}`;
	}

	return path;
}

export function useFileTree({
	workspaceId,
	rootPath,
}: UseFileTreeParams): UseFileTreeResult {
	const utils = workspaceTrpc.useUtils();
	const [state, setState] = useState<FileTreeState>(() => createInitialState());
	const stateRef = useRef(state);
	stateRef.current = state;

	const updateState = useCallback(
		(updater: (current: FileTreeState) => FileTreeState) => {
			setState((current) => {
				const next = updater(current);
				stateRef.current = next;
				return next;
			});
		},
		[],
	);

	const loadDirectory = useCallback(
		async (absolutePath: string, force = false): Promise<void> => {
			if (!workspaceId || !absolutePath) {
				return;
			}

			const currentState = stateRef.current;
			if (currentState.loadingDirectories.has(absolutePath)) {
				return;
			}

			if (
				!force &&
				currentState.loadedDirectories.has(absolutePath) &&
				!currentState.invalidatedDirectories.has(absolutePath)
			) {
				return;
			}

			updateState((current) => {
				const nextLoading = new Set(current.loadingDirectories);
				nextLoading.add(absolutePath);
				return {
					...current,
					loadingDirectories: nextLoading,
				};
			});

			try {
				const result = await utils.filesystem.listDirectory.fetch({
					workspaceId,
					absolutePath,
				});

				updateState((current) => {
					const nextEntries = new Map(current.entriesByPath);
					const nextChildren = new Map(current.childPathsByDirectory);
					const nextLoaded = new Set(current.loadedDirectories);
					const nextInvalidated = new Set(current.invalidatedDirectories);
					const nextLoading = new Set(current.loadingDirectories);
					nextLoading.delete(absolutePath);
					nextLoaded.add(absolutePath);
					nextInvalidated.delete(absolutePath);

					for (const entry of result.entries) {
						nextEntries.set(entry.absolutePath, entry);
					}

					nextChildren.set(
						absolutePath,
						result.entries.map((entry) => entry.absolutePath),
					);

					return {
						...current,
						childPathsByDirectory: nextChildren,
						entriesByPath: nextEntries,
						invalidatedDirectories: nextInvalidated,
						loadedDirectories: nextLoaded,
						loadingDirectories: nextLoading,
					};
				});
			} catch (error) {
				console.error(
					"[workspace-client/useFileTree] Failed to load directory:",
					{
						absolutePath,
						error,
					},
				);

				updateState((current) => {
					const nextLoading = new Set(current.loadingDirectories);
					nextLoading.delete(absolutePath);
					return {
						...current,
						loadingDirectories: nextLoading,
					};
				});
			}
		},
		[updateState, utils.filesystem.listDirectory, workspaceId],
	);

	const refreshPath = useCallback(
		async (absolutePath: string): Promise<void> => {
			await loadDirectory(absolutePath, true);
		},
		[loadDirectory],
	);

	const refreshAll = useCallback(async (): Promise<void> => {
		if (!rootPath) {
			return;
		}

		const expandedDirectories = Array.from(
			stateRef.current.expandedDirectories,
		).sort(
			(left, right) => left.split(/[/\\]/).length - right.split(/[/\\]/).length,
		);

		await loadDirectory(rootPath, true);
		for (const absolutePath of expandedDirectories) {
			if (absolutePath !== rootPath) {
				await loadDirectory(absolutePath, true);
			}
		}
	}, [loadDirectory, rootPath]);

	const expand = useCallback(
		async (absolutePath: string): Promise<void> => {
			updateState((current) => {
				const nextExpanded = new Set(current.expandedDirectories);
				nextExpanded.add(absolutePath);
				return {
					...current,
					expandedDirectories: nextExpanded,
				};
			});

			await loadDirectory(absolutePath);
		},
		[loadDirectory, updateState],
	);

	const collapse = useCallback(
		(absolutePath: string): void => {
			updateState((current) => {
				const nextExpanded = new Set(current.expandedDirectories);
				nextExpanded.delete(absolutePath);
				return {
					...current,
					expandedDirectories: nextExpanded,
				};
			});
		},
		[updateState],
	);

	const toggle = useCallback(
		async (absolutePath: string): Promise<void> => {
			if (stateRef.current.expandedDirectories.has(absolutePath)) {
				collapse(absolutePath);
				return;
			}

			await expand(absolutePath);
		},
		[collapse, expand],
	);

	const collapseAll = useCallback((): void => {
		updateState((current) => ({
			...current,
			expandedDirectories: new Set<string>(),
		}));
	}, [updateState]);

	useEffect(() => {
		updateState(() => createInitialState());
		if (!rootPath) {
			return;
		}

		void loadDirectory(rootPath, true);
	}, [loadDirectory, rootPath, updateState]);

	useWorkspaceEvent(
		"fs:events",
		workspaceId,
		(event) => {
			if (!rootPath) {
				return;
			}

			const relevantPaths = [event.absolutePath, event.oldAbsolutePath].filter(
				(path): path is string => Boolean(path),
			);
			if (!relevantPaths.some((path) => isWithinPath(rootPath, path))) {
				return;
			}

			if (event.kind === "overflow") {
				void refreshAll();
				return;
			}

			if (event.kind === "rename" && event.oldAbsolutePath) {
				const oldAbsolutePath = event.oldAbsolutePath;
				const oldParentPath = getParentPath(oldAbsolutePath);
				const newParentPath = getParentPath(event.absolutePath);

				updateState((current) => {
					let nextState = deleteSubtree(current, oldAbsolutePath);
					if (event.isDirectory) {
						const nextExpanded = new Set<string>();
						for (const path of current.expandedDirectories) {
							nextExpanded.add(
								retargetPath(path, oldAbsolutePath, event.absolutePath),
							);
						}
						nextState = {
							...nextState,
							expandedDirectories: nextExpanded,
						};
					}

					const nextInvalidated = new Set(nextState.invalidatedDirectories);
					nextInvalidated.add(oldParentPath);
					nextInvalidated.add(newParentPath);
					return {
						...nextState,
						invalidatedDirectories: nextInvalidated,
					};
				});

				if (stateRef.current.loadedDirectories.has(oldParentPath)) {
					void loadDirectory(oldParentPath, true);
				}
				if (stateRef.current.loadedDirectories.has(newParentPath)) {
					void loadDirectory(newParentPath, true);
				}
				if (
					event.isDirectory &&
					stateRef.current.expandedDirectories.has(event.absolutePath)
				) {
					void loadDirectory(event.absolutePath, true);
				}
				return;
			}

			const parentPath =
				event.kind === "update" && event.isDirectory
					? event.absolutePath
					: getParentPath(event.absolutePath);

			updateState((current) => {
				let nextState = current;
				if (event.kind === "delete" && event.isDirectory) {
					nextState = deleteSubtree(current, event.absolutePath);
				}

				const nextInvalidated = new Set(nextState.invalidatedDirectories);
				nextInvalidated.add(parentPath);
				return {
					...nextState,
					invalidatedDirectories: nextInvalidated,
				};
			});

			if (stateRef.current.loadedDirectories.has(parentPath)) {
				void loadDirectory(parentPath, true);
			}
		},
		Boolean(workspaceId && rootPath),
	);

	const rootEntries = useMemo(() => {
		const buildChildren = (directoryPath: string): FileTreeNode[] => {
			const childPaths = state.childPathsByDirectory.get(directoryPath) ?? [];
			return childPaths
				.map((childPath) => {
					const entry = state.entriesByPath.get(childPath);
					if (!entry) {
						return null;
					}

					const isExpanded = state.expandedDirectories.has(childPath);
					const isLoading = state.loadingDirectories.has(childPath);
					return {
						absolutePath: entry.absolutePath,
						kind: entry.kind,
						name: entry.name,
						relativePath: getRelativePath(rootPath, entry.absolutePath),
						isExpanded,
						isLoading,
						children:
							entry.kind === "directory" && isExpanded
								? buildChildren(childPath)
								: [],
					} satisfies FileTreeNode;
				})
				.filter((entry): entry is FileTreeNode => Boolean(entry));
		};

		return rootPath ? buildChildren(rootPath) : [];
	}, [
		rootPath,
		state.childPathsByDirectory,
		state.entriesByPath,
		state.expandedDirectories,
		state.loadingDirectories,
	]);

	const reveal = useCallback(
		async (
			absolutePath: string,
			options?: { isDirectory?: boolean },
		): Promise<void> => {
			if (!rootPath || !absolutePath.startsWith(rootPath)) return;

			const ancestors: string[] = [];
			let current = getParentPath(absolutePath);
			while (current.length >= rootPath.length && current !== absolutePath) {
				ancestors.unshift(current);
				if (current === rootPath) break;
				current = getParentPath(current);
			}

			for (const dir of ancestors) {
				await expand(dir);
			}

			// Trust a caller's explicit isDirectory hint (e.g. terminal link-click
			// that already stat'd the path) — the loaded `entriesByPath` may not
			// contain the target if its path form (case, symlink resolution) differs
			// from what `listDirectory` produced for the parent.
			const entry = stateRef.current.entriesByPath.get(absolutePath);
			const isDirectory =
				options?.isDirectory === true || entry?.kind === "directory";
			if (isDirectory) {
				await expand(absolutePath);
			}
		},
		[expand, rootPath],
	);

	return {
		isLoadingRoot: state.loadingDirectories.has(rootPath),
		collapseAll,
		rootEntries,
		expand,
		collapse,
		toggle,
		refreshAll,
		refreshPath,
		reveal,
	};
}
