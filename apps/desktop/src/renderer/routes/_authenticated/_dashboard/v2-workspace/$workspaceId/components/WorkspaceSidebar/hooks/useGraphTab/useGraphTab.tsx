import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { GraphSelection } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { SidebarTabDefinition } from "../../types";
import {
	GraphTabContent,
	type GraphSelection as GraphTabSelection,
} from "./components/GraphTabContent";
import type { GraphRefScope } from "./types";

// One page. The truncation banner in GraphTabContent surfaces when the repo
// has more history than this; pagination/fetch-next is a phase-6 concern.
const GRAPH_LIMIT = 500;

export interface UseGraphTabParams {
	workspaceId: string;
	compact: boolean;
	laneCap: number;
	showDate: boolean;
	/** Open a commit/range diff pane for a graph click. Wired to the workspace
	 *  store's ref-carrying diff-pane opener in page.tsx. */
	onOpenCommitRef?: (ref: GraphSelection, openInNewTab?: boolean) => void;
	/** Pin the diff pane a single click just opened (double-click). */
	onPinCommitPane?: () => void;
}

export function useGraphTab({
	workspaceId,
	compact,
	laneCap,
	showDate,
	onOpenCommitRef,
	onPinCommitPane,
}: UseGraphTabParams): SidebarTabDefinition {
	const collections = useCollections();
	const utils = workspaceTrpc.useUtils();
	const { ensureProjectInSidebar } = useDashboardSidebarState();

	// Live query so the row highlight re-renders the moment a graph click (or a
	// selection made elsewhere) updates the persisted graphSelection.
	const { data: [localState] = [] } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.v2WorkspaceLocalState })
				.where(({ state }) => eq(state.workspaceId, workspaceId)),
		[collections, workspaceId],
	);

	const projectId = localState?.sidebarState?.projectId;

	// A live query, not `.get()`. The header toggles below write to this
	// collection, and `.get()` is a non-reactive snapshot — the row would change
	// in localStorage while the header kept rendering the stale flag until some
	// unrelated re-render happened to run, which reads as a multi-second lag on
	// a write that already completed.
	const { data: [projectRow] = [] } = useLiveQuery(
		(query) =>
			query
				.from({ sidebarProject: collections.v2SidebarProjects })
				.where(({ sidebarProject }) =>
					eq(sidebarProject.projectId, projectId ?? ""),
				),
		[collections, projectId],
	);

	// Read defensively: project rows pre-dating these fields have them undefined.
	const graphRefScope = projectRow?.graphRefScope || "local";
	const twoLineRefs = projectRow?.graphTwoLineRefs ?? false;
	const unreferencedOnly = projectRow?.graphUnreferencedOnly ?? false;

	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(
		{ workspaceId },
		{ staleTime: Number.POSITIVE_INFINITY },
	);
	const baseBranch = baseBranchQuery.data?.baseBranch ?? null;

	const graphQuery = workspaceTrpc.git.listGraph.useQuery(
		{
			workspaceId,
			baseBranch: baseBranch ?? undefined,
			refScope: graphRefScope,
			limit: GRAPH_LIMIT,
		},
		{ staleTime: 30_000 },
	);

	// Invalidate only on broad git state changes. When `paths` is present the
	// event is a worktree-only edit (file content), which can't move refs, so
	// the graph is unchanged and we skip the refetch.
	useWorkspaceEvent("git:changed", workspaceId, (payload) => {
		if (payload.paths && payload.paths.length > 0) return;
		void utils.git.listGraph.invalidate();
	});

	// The graph owns its own selection (graphSelection), separate from the
	// Changes tab's changesFilter. Clicking around the graph no longer retargets
	// the Changes tab — the two surfaces no longer fight over one selection.
	const graphSelection = localState?.sidebarState?.graphSelection ?? null;
	const selection: GraphTabSelection =
		graphSelection?.kind === "commit"
			? { kind: "commit", hash: graphSelection.hash }
			: graphSelection?.kind === "range"
				? {
						kind: "range",
						fromHash: graphSelection.fromHash,
						toHash: graphSelection.toHash,
					}
				: { kind: "none" };

	// Row click selects a single commit (the new anchor) and opens its diff
	// pane; shift-click extends from the anchor into a range. cmd/ctrl-click
	// forces a new pane. The anchor is the last single-commit selection, or the
	// start of the current range, so repeated shift-clicks keep extending from
	// the same origin.
	const handleSelectRow = useCallback(
		(
			hash: string,
			{ shiftKey, metaKey }: { shiftKey: boolean; metaKey: boolean },
		) => {
			const current =
				collections.v2WorkspaceLocalState.get(workspaceId)?.sidebarState
					?.graphSelection ?? null;
			const anchor =
				current?.kind === "commit"
					? current.hash
					: current?.kind === "range"
						? current.fromHash
						: null;
			const ref: GraphSelection =
				shiftKey && anchor && anchor !== hash
					? { kind: "range", fromHash: anchor, toHash: hash }
					: { kind: "commit", hash };
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.graphSelection = ref;
			});
			onOpenCommitRef?.(ref, metaKey);
		},
		[collections, workspaceId, onOpenCommitRef],
	);

	// Double-click pins the preview pane the first click already opened — the
	// identical "click an active row to pin" convention the file tree uses. No
	// debounce: the single click opens immediately, this just flips the pin.
	const handleDoubleClickRow = useCallback(() => {
		onPinCommitPane?.();
	}, [onPinCommitPane]);

	// Row context menu → always a fresh commit pane, never a reuse.
	const handleOpenInNewTab = useCallback(
		(hash: string) => {
			onOpenCommitRef?.({ kind: "commit", hash }, true);
		},
		[onOpenCommitRef],
	);

	// `ensureProjectInSidebar` first, matching useV2ProjectDefaultApp: a project
	// with no sidebar row yet would otherwise swallow the write entirely. It is
	// idempotent — an existing row is left untouched.
	const toggleTwoLineRefs = useCallback(() => {
		if (!projectId) return;
		ensureProjectInSidebar(projectId);
		collections.v2SidebarProjects.update(projectId, (draft) => {
			draft.graphTwoLineRefs = !draft.graphTwoLineRefs;
		});
	}, [collections, ensureProjectInSidebar, projectId]);
	const selectRefScope = useCallback(
		(scope: GraphRefScope) => {
			if (!projectId) return;
			ensureProjectInSidebar(projectId);
			collections.v2SidebarProjects.update(projectId, (draft) => {
				draft.graphRefScope = scope;
			});
		},
		[collections, ensureProjectInSidebar, projectId],
	);
	const toggleUnreferencedOnly = useCallback(() => {
		if (!projectId) return;
		ensureProjectInSidebar(projectId);
		collections.v2SidebarProjects.update(projectId, (draft) => {
			draft.graphUnreferencedOnly = !draft.graphUnreferencedOnly;
		});
	}, [collections, ensureProjectInSidebar, projectId]);

	const commits = graphQuery.data?.commits ?? [];
	const totalCommits = graphQuery.data?.totalCommits ?? null;
	const hasMore = graphQuery.data?.nextCursor != null;

	const content = (
		<GraphTabContent
			commits={commits}
			totalCommits={totalCommits}
			hasMore={hasMore}
			limit={GRAPH_LIMIT}
			isLoading={graphQuery.isLoading}
			isFetching={graphQuery.isFetching}
			isError={graphQuery.isError}
			error={graphQuery.error}
			compact={compact}
			laneCap={laneCap}
			showDate={showDate}
			refScope={graphRefScope}
			onSelectRefScope={selectRefScope}
			twoLineRefs={twoLineRefs}
			onToggleTwoLineRefs={toggleTwoLineRefs}
			unreferencedOnly={unreferencedOnly}
			onToggleUnreferencedOnly={toggleUnreferencedOnly}
			selection={selection}
			onSelectRow={handleSelectRow}
			onDoubleClickRow={handleDoubleClickRow}
			onOpenInNewTab={handleOpenInNewTab}
		/>
	);

	return {
		id: "graph",
		label: "Graph",
		content,
	};
}
