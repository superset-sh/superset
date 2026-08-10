import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { useNewWorkspaceScreenVariant } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/hooks/useNewWorkspaceScreenVariant";
import { NewWorkspaceEmptyScreen } from "./components/NewWorkspaceEmptyScreen";
import { V2WorkspacesBoard } from "./components/V2WorkspacesBoard";
import { V2WorkspacesHeader } from "./components/V2WorkspacesHeader";
import { V2WorkspacesList } from "./components/V2WorkspacesList";
import { useAccessibleV2Workspaces } from "./hooks/useAccessibleV2Workspaces";
import {
	DEVICE_FILTER_THIS_DEVICE,
	useV2WorkspacesFilterStore,
	V2_WORKSPACES_AGENT_STATUS_FILTERS,
	V2_WORKSPACES_ARCHIVED_WINDOWS,
	V2_WORKSPACES_PR_STATE_FILTERS,
	type V2WorkspacesAgentStatusFilter,
	type V2WorkspacesArchivedWindow,
	type V2WorkspacesPrStateFilter,
	type V2WorkspacesViewMode,
} from "./stores/v2WorkspacesFilterStore";

export type V2WorkspacesSearch = {
	q?: string;
	device?: string;
	/** Comma-joined project ids; may include the `__sessions__` sentinel. */
	projects?: string;
	/** Comma-joined PR states. */
	pr?: string;
	/** Comma-joined agent statuses. */
	agent?: string;
	view?: "board";
	archived?: V2WorkspacesArchivedWindow;
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

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspaces/",
)({
	component: V2WorkspacesPage,
	validateSearch: (search: Record<string, unknown>): V2WorkspacesSearch => ({
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
		view: search.view === "board" ? "board" : undefined,
		archived: V2_WORKSPACES_ARCHIVED_WINDOWS.includes(
			search.archived as V2WorkspacesArchivedWindow,
		)
			? (search.archived as V2WorkspacesArchivedWindow)
			: undefined,
	}),
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
			...(search.view !== undefined && {
				viewMode: "board" as V2WorkspacesViewMode,
			}),
			...(search.archived !== undefined && {
				archivedWindow: search.archived,
			}),
		});
	}

	useEffect(() => {
		const syncUrl = navigate({
			search: {
				q: searchQuery || undefined,
				device:
					deviceFilter !== DEVICE_FILTER_THIS_DEVICE ? deviceFilter : undefined,
				projects: projectFilters.length ? projectFilters.join(",") : undefined,
				pr: prStateFilters.length ? prStateFilters.join(",") : undefined,
				agent: agentStatusFilters.length
					? agentStatusFilters.join(",")
					: undefined,
				view: viewMode === "board" ? "board" : undefined,
				archived: archivedWindow !== "week" ? archivedWindow : undefined,
			},
			replace: true,
		});
		void Promise.resolve(syncUrl).catch((error) => {
			console.error("[v2-workspaces] filter URL sync failed", error);
		});
	}, [
		navigate,
		searchQuery,
		deviceFilter,
		projectFilters,
		prStateFilters,
		agentStatusFilters,
		viewMode,
		archivedWindow,
	]);

	const { all, isReady, hostOptions, projectOptions, hostsById, projectsById } =
		useAccessibleV2Workspaces({
			searchQuery,
			deviceFilter,
			projectFilters,
			prStateFilters,
			agentStatusFilters,
			// Tombstones ride along so the board's Merged/Deleted columns work;
			// the list layout renders live rows only, so it skips the fetch.
			includeArchived: viewMode === "board",
		});

	const liveWorkspaces = useMemo(
		() => all.filter((workspace) => workspace.archivedAt == null),
		[all],
	);

	// Experiment test arm: with zero workspaces the dashboard IS the create
	// screen — the "No workspaces yet" empty state never shows. Gated on
	// isReady (never pin over rows that are still settling) and on default
	// filters so a filtered-to-empty view keeps the normal empty state.
	// Evaluating the flag here is the exposure moment.
	const isEmptyDashboard =
		isReady &&
		liveWorkspaces.length === 0 &&
		!searchQuery.trim() &&
		projectFilters.length === 0 &&
		prStateFilters.length === 0 &&
		agentStatusFilters.length === 0 &&
		deviceFilter === DEVICE_FILTER_THIS_DEVICE;
	const variant = useNewWorkspaceScreenVariant(isEmptyDashboard);
	if (variant === "test" && isEmptyDashboard) {
		return <NewWorkspaceEmptyScreen />;
	}

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<V2WorkspacesHeader
				hostOptions={hostOptions}
				projectOptions={projectOptions}
				hostsById={hostsById}
				projectsById={projectsById}
			/>
			{viewMode === "board" ? (
				<V2WorkspacesBoard workspaces={all} isReady={isReady} />
			) : (
				<V2WorkspacesList workspaces={liveWorkspaces} isReady={isReady} />
			)}
		</div>
	);
}
