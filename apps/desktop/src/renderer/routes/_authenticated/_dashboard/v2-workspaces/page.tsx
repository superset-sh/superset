import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useRef } from "react";
import { V2WorkspacesArchived } from "./components/V2WorkspacesArchived";
import { V2WorkspacesBoard } from "./components/V2WorkspacesBoard";
import { V2WorkspacesHeader } from "./components/V2WorkspacesHeader";
import { V2WorkspacesList } from "./components/V2WorkspacesList";
import { useAccessibleV2Workspaces } from "./hooks/useAccessibleV2Workspaces";
import {
	DEVICE_FILTER_THIS_DEVICE,
	useV2WorkspacesFilterStore,
	V2_WORKSPACES_AGENT_STATUS_FILTERS,
	V2_WORKSPACES_PR_STATE_FILTERS,
	type V2WorkspacesAgentStatusFilter,
	type V2WorkspacesPrStateFilter,
} from "./stores/v2WorkspacesFilterStore";
import {
	parseV2WorkspacesSearch,
	type V2WorkspacesSearch,
} from "./utils/parseV2WorkspacesSearch";

export type { V2WorkspacesSearch };

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

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspaces/",
)({
	component: V2WorkspacesPage,
	validateSearch: parseV2WorkspacesSearch,
});

function V2WorkspacesPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
	const deviceFilter = useV2WorkspacesFilterStore(
		(state) => state.deviceFilter,
	);
	const projectFilters = useV2WorkspacesFilterStore(
		(state) => state.projectFilters,
	);
	const prStateFilters = useV2WorkspacesFilterStore(
		(state) => state.prStateFilters,
	);
	const agentStatusFilters = useV2WorkspacesFilterStore(
		(state) => state.agentStatusFilters,
	);
	const creatorFilters = useV2WorkspacesFilterStore(
		(state) => state.creatorFilters,
	);
	const pinFilter = useV2WorkspacesFilterStore((state) => state.pinFilter);
	const viewMode = useV2WorkspacesFilterStore((state) => state.viewMode);
	const archivedWindow = useV2WorkspacesFilterStore(
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
		useV2WorkspacesFilterStore.setState({
			searchQuery: search.q ?? "",
			...(search.device !== undefined && { deviceFilter: search.device }),
			...(search.projects !== undefined && {
				projectFilters: parseList(search.projects),
			}),
			...(search.pr !== undefined && {
				prStateFilters: parseList<V2WorkspacesPrStateFilter>(
					search.pr,
					V2_WORKSPACES_PR_STATE_FILTERS,
				),
			}),
			...(search.agent !== undefined && {
				agentStatusFilters: parseList<V2WorkspacesAgentStatusFilter>(
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

	const isArchivedView = viewMode === "archived";
	const {
		all,
		isReady,
		shelvedCount,
		hostOptions,
		projectOptions,
		creatorOptions,
		hostsById,
		projectsById,
	} = useAccessibleV2Workspaces({
		searchQuery: deferredSearchQuery,
		deviceFilter,
		projectFilters,
		prStateFilters,
		agentStatusFilters,
		creatorFilters,
		pinFilter,
		// Tombstones ride along so the live views' Merged/Deleted groups work
		// (each scopes them by the shared History window); the Archived view
		// instead lists the user-archived rows. Exactly one of the two.
		includeArchived: !isArchivedView,
		includeShelved: isArchivedView,
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
			<V2WorkspacesHeader
				hostOptions={hostOptions}
				projectOptions={projectOptions}
				creatorOptions={creatorOptions}
				hostsById={hostsById}
				projectsById={projectsById}
				archivedCount={shelvedCount}
			/>
			{viewMode === "archived" ? (
				<V2WorkspacesArchived
					workspaces={deferredWorkspaces}
					isReady={deferredIsReady}
				/>
			) : viewMode === "board" ? (
				<V2WorkspacesBoard
					workspaces={deferredWorkspaces}
					isReady={deferredIsReady}
				/>
			) : (
				<V2WorkspacesList
					workspaces={deferredWorkspaces}
					isReady={deferredIsReady}
				/>
			)}
		</div>
	);
}
