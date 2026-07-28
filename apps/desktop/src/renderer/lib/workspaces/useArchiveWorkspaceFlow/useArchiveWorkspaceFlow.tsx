import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import type { HostWorkspaceRow } from "renderer/hooks/host-workspaces/useHostWorkspaces/useHostWorkspaces.utils";
import { track } from "renderer/lib/analytics";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import {
	type HostWorkspaceItem,
	useHostWorkspaces,
} from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

export type ArchiveWorkspaceSource =
	| "sidebar"
	| "command-palette"
	| "hotkey"
	| "workspaces-page"
	| "missing-worktree";

export type UnarchiveWorkspaceSource = "undo-toast" | "settings";

const UNDO_TOAST_DURATION_MS = 8_000;

function toOptimisticRow(
	item: HostWorkspaceItem,
	archivedAt: Date | null,
): HostWorkspaceRow {
	return {
		...item,
		worktreePath: item.worktreePath ?? "",
		worktreeExists: item.worktreeExists ?? true,
		archivedAt,
	};
}

/**
 * The instant-archive flow that replaced the v2 delete dialog: flag the row
 * and offer Undo via toast. Nothing else is touched — the worktree and branch
 * stay on disk, and terminal sessions keep running (the host's reaper
 * suspends them later) so an Undo restores fully warm terminals. Permanent
 * deletion lives in Settings → Archived workspaces.
 *
 * Host resolution is imperative (`cache.resolveHostUrl`) rather than the
 * per-workspace hook pattern so one instance can archive any workspace picked
 * at event time (layout hotkey, command palette).
 */
export function useArchiveWorkspaceFlow() {
	const navigate = useNavigate();
	const { workspaces, archivedWorkspaces, cache } = useHostWorkspaces();
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();

	const unarchiveWorkspace = useCallback(
		async ({
			workspaceId,
			source,
		}: {
			workspaceId: string;
			source: UnarchiveWorkspaceSource;
		}): Promise<boolean> => {
			const item =
				archivedWorkspaces.find((w) => w.id === workspaceId) ??
				workspaces.find((w) => w.id === workspaceId);
			if (!item) return false;
			const hostUrl = cache.resolveHostUrl(item.hostId);
			if (!hostUrl) {
				toast.error("Host is offline — workspace stays archived.");
				return false;
			}
			cache.upsertWorkspace(toOptimisticRow(item, null));
			try {
				await getHostServiceClientByUrl(
					hostUrl,
				).workspaceCleanup.unarchive.mutate({ workspaceId });
				track("workspace_unarchived", { workspace_id: workspaceId, source });
				return true;
			} catch (err) {
				cache.invalidateHost(item.hostId);
				const message = err instanceof Error ? err.message : String(err);
				toast.error(`Failed to restore workspace: ${message}`);
				return false;
			}
		},
		[workspaces, archivedWorkspaces, cache],
	);

	const archiveWorkspace = useCallback(
		async ({
			workspaceId,
			source,
		}: {
			workspaceId: string;
			source: ArchiveWorkspaceSource;
		}): Promise<boolean> => {
			const item = workspaces.find((w) => w.id === workspaceId);
			if (!item || item.type === "main") return false;
			const hostUrl = cache.resolveHostUrl(item.hostId);
			if (!hostUrl) {
				toast.error("Host is offline — cannot archive this workspace.");
				return false;
			}

			// Navigate up-front: no-ops if the archived workspace isn't the
			// active route, so a later user navigation won't be hijacked.
			navigateAwayFromWorkspace(workspaceId);
			cache.upsertWorkspace(toOptimisticRow(item, new Date()));

			try {
				const result = await getHostServiceClientByUrl(
					hostUrl,
				).workspaceCleanup.archive.mutate({ workspaceId });
				track("workspace_archived", {
					workspace_id: workspaceId,
					host_id: item.hostId,
					source,
				});
				for (const warning of result.warnings) toast.warning(warning);
				toast(`Archived "${item.name || item.branch}"`, {
					description: (
						<button
							type="button"
							className="underline underline-offset-2"
							onClick={() =>
								void navigate({ to: "/settings/archived-workspaces" })
							}
						>
							View archived workspaces in Settings
						</button>
					),
					action: {
						label: "Undo",
						onClick: () =>
							void unarchiveWorkspace({ workspaceId, source: "undo-toast" }),
					},
					duration: UNDO_TOAST_DURATION_MS,
				});
				return true;
			} catch (err) {
				cache.invalidateHost(item.hostId);
				const message = err instanceof Error ? err.message : String(err);
				toast.error(`Failed to archive workspace: ${message}`);
				return false;
			}
		},
		[
			workspaces,
			cache,
			navigate,
			navigateAwayFromWorkspace,
			unarchiveWorkspace,
		],
	);

	return { archiveWorkspace, unarchiveWorkspace };
}
