import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import type {
	HostWorkspaceItem,
	HostWorkspaceRow,
} from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

/** Mirrors the host's `workspaceCleanup.shelve` input enum (typechecked at
 * the mutation call); analytics fire host-side with this value. */
export type ArchiveWorkspaceSource =
	| "sidebar"
	| "sidebar-menu"
	| "hotkey"
	| "command-palette"
	| "workspaces-page"
	| "bulk";

export type UnarchiveWorkspaceSource =
	| "undo-toast"
	| "workspaces-page"
	| "deep-link";

/** Longer than a slip needs, shorter than the host's suspend grace (60s),
 * so an Undo inside the toast always gets the very same terminals back. */
const ARCHIVE_TOAST_DURATION_MS = 8_000;

export interface UseArchiveWorkspaceFlow {
	/**
	 * Archive one or many workspaces: instant, optimistic, no confirmation,
	 * one undo toast. Main and cloud workspaces are skipped. Resolves to the
	 * ids that were actually archived.
	 */
	archiveWorkspaces: (input: {
		workspaceIds: string[];
		source: ArchiveWorkspaceSource;
	}) => Promise<string[]>;
	/**
	 * Restore an archived workspace. `open` navigates to it on success
	 * (Undo of the workspace the user was looking at); otherwise a
	 * `Restored` toast offers Open. Resolves true once restored.
	 */
	unarchiveWorkspace: (input: {
		workspaceId: string;
		source: UnarchiveWorkspaceSource;
		open?: boolean;
	}) => Promise<boolean>;
}

const ARCHIVED_VIEW_SEARCH = { view: "archived" } as const;

function archiveToastId(workspaceIds: string[]): string {
	// Keyed by workspace so rapid archive → undo → archive replaces one toast
	// instead of stacking; a bulk batch keys on its whole id set.
	return `archive-${workspaceIds.join(",")}`;
}

/** The cached row shape `upsertWorkspace` wants, minus the merge-time
 * `hostReachable` decoration. */
function toCachedRow(item: HostWorkspaceItem): HostWorkspaceRow {
	const { hostReachable: _hostReachable, ...row } = item;
	return {
		...row,
		worktreePath: row.worktreePath ?? "",
		worktreeExists: row.worktreeExists ?? true,
	};
}

/**
 * The single archive/unarchive flow. Every entry point reaches it through
 * ArchiveWorkspaceMount (see archive-workspace-intent); the Archived view
 * and the deep-link archived state call `unarchiveWorkspace` directly.
 *
 * Archiving sets one flag on the host and nothing else — terminals keep
 * running through the undo window — so the renderer side is: navigate away
 * if the workspace is open, patch the cache optimistically, call the host,
 * and on failure put the captured pre-mutation row back (then invalidate;
 * invalidation alone would leave the workspace vanished until a refetch).
 * Sidebar sections, pins, and pane layouts are deliberately untouched:
 * leaving them alone is what makes Undo restore the workspace exactly.
 */
export function useArchiveWorkspaceFlow(): UseArchiveWorkspaceFlow {
	const { t } = useLingui();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { workspaces, shelvedWorkspaces, cache } = useHostWorkspaces();
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();

	// Resolved imperatively at call time (not bound to one id at render): the
	// hotkey, the palette, and bulk selection only know the ids when they fire.
	const findRow = useCallback(
		(workspaceId: string): HostWorkspaceItem | undefined =>
			workspaces.find((workspace) => workspace.id === workspaceId) ??
			shelvedWorkspaces.find((workspace) => workspace.id === workspaceId),
		[workspaces, shelvedWorkspaces],
	);

	const openArchivedView = useCallback(() => {
		void navigate({ to: "/v2-workspaces", search: ARCHIVED_VIEW_SEARCH });
	}, [navigate]);

	const unarchiveWorkspace = useCallback<
		UseArchiveWorkspaceFlow["unarchiveWorkspace"]
	>(
		async ({ workspaceId, source, open = false }) => {
			const row = findRow(workspaceId);
			if (!row) return false;
			const name = row.name || row.branch;
			const hostUrl = cache.resolveHostUrl(row.hostId);
			if (!hostUrl) {
				toast.error(
					t({
						message: `Can't restore "${name}": its host is offline.`,
					}),
				);
				return false;
			}
			const captured = toCachedRow(row);
			cache.upsertWorkspace({ ...captured, shelvedAt: null });
			try {
				await getHostServiceClientByUrl(
					hostUrl,
				).workspaceCleanup.unshelve.mutate({ workspaceId, source });
			} catch (error) {
				cache.upsertWorkspace(captured);
				cache.invalidateHost(row.hostId);
				toast.error(
					t({
						message: `Failed to restore "${name}": ${errorMessage(error, t({ message: "Unknown error" }))}`,
					}),
				);
				return false;
			}
			if (open) {
				void navigateToV2Workspace(workspaceId, navigate);
			} else if (source === "workspaces-page") {
				// Undo just puts the row back where it was; the deep-link state
				// re-renders as the workspace itself. Only the Archived view
				// leaves the user somewhere else, so only it offers Open.
				toast(t({ message: `Restored "${name}"` }), {
					id: `restore-${workspaceId}`,
					action: {
						label: t({ message: "Open" }),
						onClick: () => void navigateToV2Workspace(workspaceId, navigate),
					},
				});
			}
			return true;
		},
		[findRow, cache, navigate, t],
	);

	const archiveWorkspaces = useCallback<
		UseArchiveWorkspaceFlow["archiveWorkspaces"]
	>(
		async ({ workspaceIds, source }) => {
			const targets: { row: HostWorkspaceItem; hostUrl: string }[] = [];
			let offline = 0;
			for (const workspaceId of new Set(workspaceIds)) {
				const row = findRow(workspaceId);
				if (!row || row.shelvedAt != null) continue;
				// Never archivable: the project's own checkout, and cloud
				// sandboxes, which keep their delete path.
				if (row.type === "main" || cache.isSandboxHost(row.hostId)) continue;
				const hostUrl = cache.resolveHostUrl(row.hostId);
				if (!hostUrl) {
					offline += 1;
					continue;
				}
				targets.push({ row, hostUrl });
			}
			if (offline > 0) {
				toast.error(
					t({
						message: plural(offline, {
							one: "Can't archive # workspace: its host is offline.",
							other: "Can't archive # workspaces: their hosts are offline.",
						}),
					}),
				);
			}
			if (targets.length === 0) return [];

			const ids = targets.map(({ row }) => row.id);
			// Leave a dead route before the row vanishes from the sidebar; the
			// whole batch is excluded from the sibling search so a bulk archive
			// can't land the user on another workspace it is about to archive.
			const v2Match = matchRoute({
				to: "/v2-workspace/$workspaceId",
				fuzzy: true,
			});
			const activeWorkspaceId =
				v2Match !== false && ids.includes(v2Match.workspaceId)
					? v2Match.workspaceId
					: null;
			if (activeWorkspaceId) {
				navigateAwayFromWorkspace(activeWorkspaceId, new Set(ids));
			}

			const shelvedAt = Date.now();
			const captured = new Map(
				targets.map(({ row }) => [row.id, toCachedRow(row)] as const),
			);
			for (const row of captured.values()) {
				cache.upsertWorkspace({ ...row, shelvedAt });
			}

			const settled = await Promise.allSettled(
				targets.map(({ row, hostUrl }) =>
					getHostServiceClientByUrl(hostUrl).workspaceCleanup.shelve.mutate({
						workspaceId: row.id,
						source,
					}),
				),
			);

			const archived: HostWorkspaceItem[] = [];
			const failedHosts = new Set<string>();
			settled.forEach((result, index) => {
				const target = targets[index];
				if (!target) return;
				if (result.status === "fulfilled") {
					archived.push(target.row);
					return;
				}
				const previous = captured.get(target.row.id);
				if (previous) cache.upsertWorkspace(previous);
				failedHosts.add(target.row.hostId);
				const name = target.row.name || target.row.branch;
				toast.error(
					t({
						message: `Failed to archive "${name}": ${errorMessage(result.reason, t({ message: "Unknown error" }))}`,
					}),
				);
			});
			for (const hostId of failedHosts) cache.invalidateHost(hostId);
			if (archived.length === 0) return [];

			const archivedIds = archived.map((row) => row.id);
			const toastId = archiveToastId(archivedIds);
			const single = archived.length === 1 ? archived[0] : null;
			const title = single
				? t({ message: `Archived "${single.name || single.branch}"` })
				: t({
						message: plural(archived.length, {
							one: "Archived # workspace",
							other: "Archived # workspaces",
						}),
					});
			toast(title, {
				id: toastId,
				duration: ARCHIVE_TOAST_DURATION_MS,
				description: (
					<button
						type="button"
						className="underline underline-offset-2 hover:text-foreground"
						onClick={() => {
							toast.dismiss(toastId);
							openArchivedView();
						}}
					>
						<Trans>View archived workspaces</Trans>
					</button>
				),
				action: {
					label: single ? t({ message: "Undo" }) : t({ message: "Undo all" }),
					onClick: () => {
						toast.dismiss(toastId);
						for (const workspaceId of archivedIds) {
							void unarchiveWorkspace({
								workspaceId,
								source: "undo-toast",
								// Undo puts the user back where they were.
								open: workspaceId === activeWorkspaceId,
							});
						}
					},
				},
			});
			return archivedIds;
		},
		[
			findRow,
			cache,
			matchRoute,
			navigateAwayFromWorkspace,
			openArchivedView,
			unarchiveWorkspace,
			t,
		],
	);

	return { archiveWorkspaces, unarchiveWorkspace };
}
