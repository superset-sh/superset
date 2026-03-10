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

/** A file match returned by the file search. */
interface FileResult {
	id: string;
	resultType: "file";
	name: string;
	relativePath: string;
	path: string;
	isDirectory: boolean;
	score: number;
	workspaceId?: string;
	workspaceName?: string;
}

/** A workspace match returned by fuzzy-filtering workspace/project names. */
interface WorkspaceResult {
	id: string;
	resultType: "workspace";
	name: string;
	projectName: string;
	type: "worktree" | "branch";
}

/** Discriminated union of all result types shown in the command palette. */
export type CommandPaletteResult = FileResult | WorkspaceResult;

interface UseCommandPaletteParams {
	workspaceId: string;
	navigate: UseNavigateResult<string>;
}

/** Manages command palette state: search query, file results, workspace results, and selection. */
export function useCommandPalette({
	workspaceId,
	navigate,
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

	// Fetch all grouped workspaces (when dialog is open - used for workspace search and global file search)
	const { data: allGrouped } = electronTrpc.workspaces.getAllGrouped.useQuery(
		undefined,
		{
			enabled: open,
		},
	);

	// Filter workspaces matching the query
	const workspaceMatches = useMemo((): WorkspaceResult[] => {
		if (!allGrouped || !query.trim()) return [];
		const q = query.trim().toLowerCase();
		const matches: WorkspaceResult[] = [];
		for (const group of allGrouped) {
			const addIfMatches = (ws: {
				id: string;
				name: string;
				type: "worktree" | "branch";
			}) => {
				const displayName = getWorkspaceDisplayName(
					ws.name,
					ws.type,
					group.project.name,
				);
				if (
					displayName.toLowerCase().includes(q) ||
					ws.name.toLowerCase().includes(q) ||
					group.project.name.toLowerCase().includes(q)
				) {
					matches.push({
						id: ws.id,
						resultType: "workspace",
						name: ws.name,
						projectName: group.project.name,
						type: ws.type,
					});
				}
			};
			for (const ws of group.workspaces) {
				addIfMatches(ws);
			}
			for (const section of group.sections) {
				for (const ws of section.workspaces) {
					addIfMatches(ws);
				}
			}
		}
		return matches;
	}, [allGrouped, query]);

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
	const multiSearch = electronTrpc.filesystem.searchFilesMulti.useQuery(
		{
			roots,
			query: debouncedQuery,
			includePattern,
			excludePattern,
			limit: SEARCH_LIMIT,
		},
		{
			enabled:
				open &&
				scope === "global" &&
				roots.length > 0 &&
				debouncedQuery.length > 0,
			staleTime: 1000,
		},
	);

	const fileResults: FileResult[] = useMemo(() => {
		const raw =
			scope === "workspace"
				? singleSearch.searchResults
				: (multiSearch.data ?? []);
		return raw.map((r) => ({ ...r, resultType: "file" as const }));
	}, [scope, singleSearch.searchResults, multiSearch.data]);

	// Combine workspace matches (first) with file results
	const searchResults: CommandPaletteResult[] = useMemo(
		() => [...workspaceMatches, ...fileResults],
		[workspaceMatches, fileResults],
	);

	const isFetching =
		scope === "workspace"
			? singleSearch.isFetching
			: multiSearch.isFetching ||
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

	const selectResult = useCallback(
		(result: CommandPaletteResult) => {
			if (result.resultType === "workspace") {
				handleOpenChange(false);
				navigateToWorkspace(result.id, navigate);
			} else {
				const targetWs = result.workspaceId ?? workspaceId;
				useTabsStore
					.getState()
					.addFileViewerPane(targetWs, { filePath: result.relativePath });
				handleOpenChange(false);
				if (targetWs !== workspaceId) {
					navigateToWorkspace(targetWs, navigate);
				}
			}
		},
		[workspaceId, handleOpenChange, navigate],
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
		selectResult,
		searchResults,
		isFetching,
		scope,
		setScope,
	};
}
