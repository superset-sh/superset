import type { UseNavigateResult } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getWorkspaceDisplayName } from "renderer/lib/getWorkspaceDisplayName";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useFileSearch } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileSearch/useFileSearch";
import {
	type SearchScope,
	useSearchDialogStore,
} from "renderer/stores/search-dialog-state";
import { useTabsStore } from "renderer/stores/tabs/store";

const SEARCH_LIMIT = 50;

interface UseCommandPaletteParams {
	workspaceId: string;
	navigate: UseNavigateResult<string>;
	onSelectFile?: (input: {
		filePath: string;
		targetWorkspaceId: string;
		close: () => void;
		navigate: UseNavigateResult<string>;
	}) => void;
}

export function useCommandPalette({
	workspaceId,
	navigate,
	onSelectFile,
}: UseCommandPaletteParams) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const includePattern = useSearchDialogStore(
		(state) => state.byMode.quickOpen.includePattern,
	);
	const excludePattern = useSearchDialogStore(
		(state) => state.byMode.quickOpen.excludePattern,
	);
	const filtersOpen = useSearchDialogStore(
		(state) => state.byMode.quickOpen.filtersOpen,
	);
	const scope =
		useSearchDialogStore((state) => state.byMode.quickOpen.scope) ??
		"workspace";
	const setIncludePatternByMode = useSearchDialogStore(
		(state) => state.setIncludePattern,
	);
	const setExcludePatternByMode = useSearchDialogStore(
		(state) => state.setExcludePattern,
	);
	const setFiltersOpenByMode = useSearchDialogStore(
		(state) => state.setFiltersOpen,
	);
	const setScopeByMode = useSearchDialogStore((state) => state.setScope);

	// Fetch all grouped workspaces (only when global scope is active and dialog is open)
	const { data: allGrouped } = electronTrpc.workspaces.getAllGrouped.useQuery(
		undefined,
		{
			enabled: open && scope === "global",
		},
	);

	// Build roots array for multi-workspace search
	const roots = useMemo(() => {
		if (scope !== "global" || !allGrouped) return [];
		const result: {
			rootPath: string;
			workspaceId: string;
			workspaceName: string;
		}[] = [];
		for (const group of allGrouped) {
			const addWorkspace = (ws: {
				id: string;
				worktreePath: string;
				name: string;
				type: "worktree" | "branch";
			}) => {
				if (ws.worktreePath) {
					result.push({
						rootPath: ws.worktreePath,
						workspaceId: ws.id,
						workspaceName: getWorkspaceDisplayName(
							ws.name,
							ws.type,
							group.project.name,
						),
					});
				}
			};
			for (const ws of group.workspaces) {
				addWorkspace(ws);
			}
			for (const section of group.sections) {
				for (const ws of section.workspaces) {
					addWorkspace(ws);
				}
			}
		}
		return result;
	}, [scope, allGrouped]);

	// Single-workspace search (existing behavior)
	const singleSearch = useFileSearch({
		workspaceId: open && scope === "workspace" ? workspaceId : undefined,
		searchTerm: query,
		includePattern,
		excludePattern,
		limit: SEARCH_LIMIT,
	});

	// Multi-workspace search
	const debouncedQuery = useDebouncedValue(query.trim(), 150);
	const multiSearchQueries = electronTrpc.useQueries((t) =>
		open && scope === "global" && roots.length > 0 && debouncedQuery.length > 0
			? roots.map((root) =>
					t.filesystem.searchFiles({
						workspaceId: root.workspaceId,
						query: debouncedQuery,
						includePattern,
						excludePattern,
						limit: SEARCH_LIMIT,
					}),
				)
			: [],
	);

	const multiSearchResults = useMemo(
		() =>
			roots
				.flatMap((root, index) =>
					(multiSearchQueries[index]?.data?.matches ?? []).map((match) => ({
						id: match.absolutePath,
						name: match.name,
						path: match.absolutePath,
						relativePath: match.relativePath,
						isDirectory: match.kind === "directory",
						score: match.score,
						workspaceId: root.workspaceId,
						workspaceName: root.workspaceName,
					})),
				)
				.sort((left, right) => right.score - left.score)
				.slice(0, SEARCH_LIMIT),
		[roots, multiSearchQueries],
	);

	const searchResults =
		scope === "workspace" ? singleSearch.searchResults : multiSearchResults;
	const isFetching =
		scope === "workspace"
			? singleSearch.isFetching
			: multiSearchQueries.some((query) => query.isFetching) ||
				(query.trim().length > 0 && query.trim() !== debouncedQuery);

	const handleOpenChange = useCallback((nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			setQuery("");
		}
	}, []);

	const toggle = useCallback(() => {
		setOpen((prev) => {
			if (prev) {
				setQuery("");
			}
			return !prev;
		});
	}, []);

	const selectFile = useCallback(
		(filePath: string, resultWorkspaceId?: string) => {
			const targetWs = resultWorkspaceId ?? workspaceId;
			if (onSelectFile) {
				onSelectFile({
					filePath,
					targetWorkspaceId: targetWs,
					close: () => handleOpenChange(false),
					navigate,
				});
				return;
			}
			useTabsStore.getState().addFileViewerPane(targetWs, { filePath });
			handleOpenChange(false);
			if (targetWs !== workspaceId) {
				navigateToWorkspace(targetWs, navigate);
			}
		},
		[workspaceId, onSelectFile, handleOpenChange, navigate],
	);

	const setIncludePattern = useCallback(
		(value: string) => {
			setIncludePatternByMode("quickOpen", value);
		},
		[setIncludePatternByMode],
	);

	const setExcludePattern = useCallback(
		(value: string) => {
			setExcludePatternByMode("quickOpen", value);
		},
		[setExcludePatternByMode],
	);

	const setFiltersOpen = useCallback(
		(nextOpen: boolean) => {
			setFiltersOpenByMode("quickOpen", nextOpen);
		},
		[setFiltersOpenByMode],
	);

	const setScope = useCallback(
		(newScope: SearchScope) => {
			setScopeByMode("quickOpen", newScope);
		},
		[setScopeByMode],
	);

	return {
		open,
		query,
		setQuery,
		filtersOpen,
		setFiltersOpen,
		includePattern,
		setIncludePattern,
		excludePattern,
		setExcludePattern,
		handleOpenChange,
		toggle,
		selectFile,
		searchResults,
		isFetching,
		scope,
		setScope,
	};
}
