import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useRef } from "react";
import { WorkspacesBoard } from "./components/WorkspacesBoard";
import { WorkspacesHeader } from "./components/WorkspacesHeader";
import { WorkspacesList } from "./components/WorkspacesList";
import { useAccessibleWorkspaces } from "./hooks/useAccessibleWorkspaces";
import {
	DEVICE_FILTER_THIS_DEVICE,
	useWorkspacesFilterStore,
	V2_WORKSPACES_AGENT_STATUS_FILTERS,
	V2_WORKSPACES_ARCHIVED_WINDOWS,
	V2_WORKSPACES_PIN_FILTERS,
	V2_WORKSPACES_PR_STATE_FILTERS,
	type WorkspacesAgentStatusFilter,
	type WorkspacesArchivedWindow,
	type WorkspacesPinFilter,
	type WorkspacesPrStateFilter,
	type WorkspacesViewMode,
} from "./stores/workspacesFilterStore";

export type WorkspacesSearch = {
	q?: string;
	device?: string;
	/** Comma-joined project ids; may include the `__sessions__` sentinel. */
	projects?: string;
	/** Comma-joined PR states. */
	pr?: string;
	/** Comma-joined agent statuses. */
	agent?: string;
	/** Comma-joined creator user ids. */
	creators?: string;
	/** Sidebar pin visibility; omitted = "all". */
	pin?: WorkspacesPinFilter;
	view?: WorkspacesViewMode;
	archived?: WorkspacesArchivedWindow;
};

function parseList<T extends string>(
	raw: unknown,
	allowed?: readonly T[],
): T[] {
	if (typeof raw !== "string" || !raw) return [];
	const entries = raw.split(",").filter(Boolean);
	return (
		allowed ? entries.filter((entry) => allowed.includes(entry as T)) : entries
	) as T[];
}

export const Route = createFileRoute("/_authenticated/_dashboard/workspaces/")({
	component: WorkspacesPage,
	validateSearch: (search: Record<string, unknown>): WorkspacesSearch => ({
		q: typeof search.q === "string" && search.q ? search.q : undefined,
		device:
			typeof search.device === "string" && search.device
				? search.device
				: undefined,
		projects:
			typeof search.projects === "string" && search.projects
				? search.projects
				: undefined,
		pr: typeof search.pr === "string" && search.pr ? search.pr : undefined,
		agent:
			typeof search.agent === "string" && search.agent
				? search.agent
				: undefined,
		creators:
			typeof search.creators === "string" && search.creators
				? search.creators
				: undefined,
		pin: V2_WORKSPACES_PIN_FILTERS.includes(search.pin as WorkspacesPinFilter)
			? (search.pin as WorkspacesPinFilter)
			: undefined,
		view:
			search.view === "board" || search.view === "list"
				? search.view
				: undefined,
		archived: V2_WORKSPACES_ARCHIVED_WINDOWS.includes(
			search.archived as WorkspacesArchivedWindow,
		)
			? (search.archived as WorkspacesArchivedWindow)
			: undefined,
	}),
});

function WorkspacesPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	const searchQuery = useWorkspacesFilterStore((state) => state.searchQuery);
	const deviceFilter = useWorkspacesFilterStore((state) => state.deviceFilter);
	const projectFilters = useWorkspacesFilterStore(
		(state) => state.projectFilters,
	);
	const prStateFilters = useWorkspacesFilterStore(
		(state) => state.prStateFilters,
	);
	const agentStatusFilters = useWorkspacesFilterStore(
		(state) => state.agentStatusFilters,
	);
	const creatorFilters = useWorkspacesFilterStore(
		(state) => state.creatorFilters,
	);
	const pinFilter = useWorkspacesFilterStore((state) => state.pinFilter);
	const viewMode = useWorkspacesFilterStore((state) => state.viewMode);
	const archivedWindow = useWorkspacesFilterStore(
		(state) => state.archivedWindow,
	);

	// URL → store, once per mount, and only for params the URL actually
	// carries: a deep link reproduces its view exactly, while a bare
	// sidebar navigation must NOT reset the user's board/filter state back
	// to defaults. After hydration the store drives and the URL follows
	// (replace, so filter tweaks don't pollute history). The search text is
	// the exception — like the old page, it resets on every visit unless
	// the link pins it.
	const hydratedRef = useRef(false);
	if (!hydratedRef.current) {
		hydratedRef.current = true;
		useWorkspacesFilterStore.setState({
			searchQuery: search.q ?? "",
			...(search.device !== undefined && { deviceFilter: search.device }),
			...(search.projects !== undefined && {
				projectFilters: parseList(search.projects),
			}),
			...(search.pr !== undefined && {
				prStateFilters: parseList<WorkspacesPrStateFilter>(
					search.pr,
					V2_WORKSPACES_PR_STATE_FILTERS,
				),
			}),
			...(search.agent !== undefined && {
				agentStatusFilters: parseList<WorkspacesAgentStatusFilter>(
					search.agent,
					V2_WORKSPACES_AGENT_STATUS_FILTERS,
				),
			}),
			...(search.creators !== undefined && {
				creatorFilters: parseList(search.creators),
			}),
			...(search.pin !== undefined && { pinFilter: search.pin }),
			...(search.view !== undefined && { viewMode: search.view }),
			...(search.archived !== undefined && {
				archivedWindow: search.archived,
			}),
		});
	}

	// Debounced: each navigate() re-renders every router-state subscriber
	// app-wide (the dashboard sidebar most expensively), so syncing per
	// keystroke made typing in the search box wait on full sidebar renders.
	// The URL is only a deep-link mirror — one trailing update suffices.
	useEffect(() => {
		const timeout = setTimeout(() => {
			const syncUrl = navigate({
				search: {
					q: searchQuery || undefined,
					device:
						deviceFilter !== DEVICE_FILTER_THIS_DEVICE
							? deviceFilter
							: undefined,
					projects: projectFilters.length
						? projectFilters.join(",")
						: undefined,
					pr: prStateFilters.length ? prStateFilters.join(",") : undefined,
					agent: agentStatusFilters.length
						? agentStatusFilters.join(",")
						: undefined,
					creators: creatorFilters.length
						? creatorFilters.join(",")
						: undefined,
					pin: pinFilter !== "all" ? pinFilter : undefined,
					view: viewMode !== "board" ? viewMode : undefined,
					archived: archivedWindow !== "none" ? archivedWindow : undefined,
				},
				replace: true,
			});
			void Promise.resolve(syncUrl).catch((error) => {
				console.error("[v2-workspaces] filter URL sync failed", error);
			});
		}, 300);
		return () => clearTimeout(timeout);
	}, [
		navigate,
		searchQuery,
		deviceFilter,
		projectFilters,
		prStateFilters,
		agentStatusFilters,
		creatorFilters,
		pinFilter,
		viewMode,
		archivedWindow,
	]);

	// Deferred so per-keystroke filtering leaves the input's critical path:
	// the sync render reuses the previous results and the recompute follows
	// at background priority.
	const deferredSearchQuery = useDeferredValue(searchQuery);

	const {
		all,
		isReady,
		hostOptions,
		projectOptions,
		creatorOptions,
		hostsById,
		projectsById,
	} = useAccessibleWorkspaces({
		searchQuery: deferredSearchQuery,
		deviceFilter,
		projectFilters,
		prStateFilters,
		agentStatusFilters,
		creatorFilters,
		pinFilter,
		// Tombstones ride along so both views' Merged/Deleted groups work;
		// each view scopes them by the shared archived window.
		includeArchived: true,
	});

	// Re-rendering hundreds of rows takes hundreds of ms; deferring keeps
	// filter menus and checkboxes painting instantly while the list catches
	// up at background priority. isReady must lag with the rows — both
	// deferred values flip in the same background render, whereas a sync
	// isReady=true against still-empty deferred rows would flash the empty
	// state while the first rows are being rendered.
	const deferredWorkspaces = useDeferredValue(all);
	const deferredIsReady = useDeferredValue(isReady);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<WorkspacesHeader
				hostOptions={hostOptions}
				projectOptions={projectOptions}
				creatorOptions={creatorOptions}
				hostsById={hostsById}
				projectsById={projectsById}
			/>
			{viewMode === "board" ? (
				<WorkspacesBoard
					workspaces={deferredWorkspaces}
					isReady={deferredIsReady}
				/>
			) : (
				<WorkspacesList
					workspaces={deferredWorkspaces}
					isReady={deferredIsReady}
				/>
			)}
		</div>
	);
}
