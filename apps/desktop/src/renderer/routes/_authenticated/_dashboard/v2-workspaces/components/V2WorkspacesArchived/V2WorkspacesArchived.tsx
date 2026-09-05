import { Plural, Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { useMemo } from "react";
import { LuArchive, LuSearchX } from "react-icons/lu";
import { useArchiveWorkspaceFlow } from "renderer/lib/workspaces/useArchiveWorkspaceFlow";
import { useBulkDeleteWorkspacesIntent } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/stores/bulkDeleteWorkspacesIntent";
import { useDeletingWorkspacesStore } from "renderer/routes/_authenticated/_dashboard/stores/deletingWorkspacesStore";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	DEVICE_FILTER_THIS_DEVICE,
	useV2WorkspacesFilterStore,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { ArchivedWorkspaceRow } from "./components/ArchivedWorkspaceRow";

interface V2WorkspacesArchivedProps {
	/** User-archived rows (the page passes `archivedView`), already
	 * search/filter-narrowed by useAccessibleV2Workspaces. */
	workspaces: AccessibleV2Workspace[];
	isReady: boolean;
}

/**
 * The Workspaces page's third view: everything the user put away, newest
 * first, with Unarchive and Delete. Deletes reuse the existing single and
 * bulk destroy dialogs (dirty-worktree warnings, teardown-failure retry,
 * progress toast) rather than forking them; a failed destroy un-tombstones
 * still archived, so the row simply returns here.
 */
export function V2WorkspacesArchived({
	workspaces,
	isReady,
}: V2WorkspacesArchivedProps) {
	const { unarchiveWorkspace } = useArchiveWorkspaceFlow();
	const deletingIds = useDeletingWorkspacesStore((state) => state.deletingIds);
	// The header's Archived badge counts every archived row in the device
	// scope, while these rows have passed the shared search and filters — so
	// an empty list under a non-zero badge needs to say why.
	const hasActiveFilters = useV2WorkspacesFilterStore(
		(state) =>
			state.searchQuery.trim() !== "" ||
			state.deviceFilter !== DEVICE_FILTER_THIS_DEVICE ||
			state.projectFilters.length > 0 ||
			state.prStateFilters.length > 0 ||
			state.agentStatusFilters.length > 0 ||
			state.creatorFilters.length > 0 ||
			state.pinFilter !== "all",
	);
	const resetFilters = useV2WorkspacesFilterStore((state) => state.reset);

	const sorted = useMemo(
		() =>
			[...workspaces].sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
		[workspaces],
	);
	const deletable = useMemo(
		() => sorted.filter((workspace) => !workspace.hostIsOffline),
		[sorted],
	);

	const handleDeleteAll = () => {
		if (deletable.length === 0) return;
		useBulkDeleteWorkspacesIntent.getState().request(
			deletable.map((workspace) => ({
				id: workspace.id,
				hostId: workspace.hostId,
				name: workspace.name,
				branch: workspace.branch,
			})),
		);
	};

	if (sorted.length === 0) {
		// Cache-first rule: a host that hasn't answered must not read as empty.
		if (!isReady) return <div className="min-h-0 flex-1" />;
		return (
			<Empty className="flex-1 border-0">
				<EmptyHeader>
					<EmptyMedia
						variant="icon"
						className="size-14 [&_svg:not([class*='size-'])]:size-7"
					>
						{hasActiveFilters ? <LuSearchX /> : <LuArchive />}
					</EmptyMedia>
					<EmptyTitle>
						{hasActiveFilters ? (
							<Trans>No archived workspaces match your filters</Trans>
						) : (
							<Trans>No archived workspaces</Trans>
						)}
					</EmptyTitle>
					<EmptyDescription>
						{hasActiveFilters ? (
							<Trans>Try a different search term or another device.</Trans>
						) : (
							<Trans>Archived workspaces show up here.</Trans>
						)}
					</EmptyDescription>
				</EmptyHeader>
				{hasActiveFilters ? (
					<EmptyContent>
						<Button variant="outline" size="sm" onClick={() => resetFilters()}>
							<Trans>Clear filters</Trans>
						</Button>
					</EmptyContent>
				) : null}
			</Empty>
		);
	}

	return (
		<div className="@container min-h-0 flex-1 overflow-y-auto">
			<div className="flex items-center justify-between gap-3 border-b border-border/40 px-6 py-2">
				<span className="text-xs text-muted-foreground">
					<Plural
						value={sorted.length}
						one="# archived workspace"
						other="# archived workspaces"
					/>
				</span>
				<Button
					variant="outline"
					size="sm"
					className="h-7 text-xs text-destructive hover:text-destructive"
					disabled={deletable.length === 0}
					onClick={handleDeleteAll}
				>
					<Trans>Delete all</Trans>
				</Button>
			</div>
			<div className="divide-y divide-border">
				{sorted.map((workspace) => (
					<ArchivedWorkspaceRow
						key={workspace.id}
						workspace={workspace}
						isDeleting={deletingIds.has(workspace.id)}
						onUnarchive={() =>
							void unarchiveWorkspace({
								workspaceId: workspace.id,
								source: "workspaces-page",
							})
						}
						onDelete={() =>
							useDeleteWorkspaceIntent.getState().request({
								workspaceId: workspace.id,
								workspaceName: workspace.name || workspace.branch,
							})
						}
					/>
				))}
			</div>
		</div>
	);
}
