import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo, useState } from "react";
import { HiOutlineArchiveBox, HiOutlineTrash } from "react-icons/hi2";
import {
	type DestroyWorkspaceError,
	normalizeDestroyWorkspaceError,
} from "renderer/hooks/host-service/useDestroyWorkspace";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences/useV2UserPreferences";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useArchiveWorkspaceFlow } from "renderer/lib/workspaces/useArchiveWorkspaceFlow";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import {
	type HostWorkspaceItem,
	useHostWorkspaces,
} from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { ArchivedWorkspaceRow } from "../ArchivedWorkspaceRow";

interface ArchivedWorkspacesSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export type ArchivedRowStatus =
	| { state: "idle" }
	| { state: "deleting" }
	| { state: "error"; error: DestroyWorkspaceError };

const IDLE: ArchivedRowStatus = { state: "idle" };

export function ArchivedWorkspacesSettings({
	visibleItems,
}: ArchivedWorkspacesSettingsProps) {
	const { archivedWorkspaces, isReady, cache } = useHostWorkspaces();
	const { unarchiveWorkspace } = useArchiveWorkspaceFlow();
	const { removeWorkspaceFromSidebar } = useDashboardSidebarState();
	const { preferences } = useV2UserPreferences();
	const deleteBranch = preferences.deleteLocalBranch;
	const [rowStatus, setRowStatus] = useState<Record<string, ArchivedRowStatus>>(
		{},
	);

	const rows = useMemo(
		() =>
			[...archivedWorkspaces].sort(
				(a, b) =>
					(b.archivedAt?.getTime() ?? 0) - (a.archivedAt?.getTime() ?? 0),
			),
		[archivedWorkspaces],
	);

	const showList = isItemVisible(
		SETTING_ITEM_ID.ARCHIVED_WORKSPACES_LIST,
		visibleItems,
	);
	const showDeleteAll = isItemVisible(
		SETTING_ITEM_ID.ARCHIVED_WORKSPACES_DELETE_ALL,
		visibleItems,
	);

	const setStatus = useCallback(
		(workspaceId: string, status: ArchivedRowStatus) => {
			setRowStatus((prev) => ({ ...prev, [workspaceId]: status }));
		},
		[],
	);

	/**
	 * Permanent delete via the existing destroy saga (teardown → worktree
	 * remove → branch delete per the Git settings preference). Mirrors the old
	 * dialog's essentials: silent force-retry on the dirty-worktree race;
	 * teardown/other failures land in per-row error state with a force option.
	 */
	const destroyOne = useCallback(
		async (
			item: HostWorkspaceItem,
			opts: { force?: boolean } = {},
		): Promise<boolean> => {
			const hostUrl = cache.resolveHostUrl(item.hostId);
			if (!hostUrl) {
				toast.error("Host is offline — cannot delete this workspace.");
				return false;
			}
			setStatus(item.id, { state: "deleting" });
			const client = getHostServiceClientByUrl(hostUrl);
			const input = {
				workspaceId: item.id,
				deleteBranch,
				force: opts.force ?? false,
			};
			try {
				let result: Awaited<
					ReturnType<typeof client.workspaceCleanup.destroy.mutate>
				>;
				try {
					result = await client.workspaceCleanup.destroy.mutate(input);
				} catch (firstErr) {
					const e = normalizeDestroyWorkspaceError(firstErr);
					// Dirty-worktree race: the user already confirmed the permanent
					// delete, so retry with force instead of bouncing them. Never
					// auto-retry `in-progress` — that's a concurrent destroy.
					if (e.kind === "conflict" && !input.force) {
						result = await client.workspaceCleanup.destroy.mutate({
							...input,
							force: true,
						});
					} else {
						throw e;
					}
				}
				cache.removeWorkspace(item.hostId, item.id);
				// Release parked pane runtimes (xterm/WebGL, WS transports) and
				// delete the persisted pane layout — the cleanup every destroy
				// entry point ran before permanent delete moved to this page.
				removeWorkspaceFromSidebar(item.id);
				for (const warning of result.warnings) toast.warning(warning);
				setStatus(item.id, IDLE);
				return true;
			} catch (err) {
				const e = normalizeDestroyWorkspaceError(err);
				if (e.kind === "in-progress") {
					toast.error(
						`A delete is already in progress for ${item.name || item.branch}.`,
					);
					setStatus(item.id, IDLE);
				} else {
					setStatus(item.id, { state: "error", error: e });
				}
				return false;
			}
		},
		[cache, deleteBranch, setStatus, removeWorkspaceFromSidebar],
	);

	const confirmDelete = useCallback(
		(item: HostWorkspaceItem) => {
			const displayName = item.name || item.branch;
			alert({
				title: "Permanently delete workspace",
				description: `Permanently delete "${displayName}"? This removes the worktree from disk${deleteBranch ? ` and deletes the local branch "${item.branch}"` : ""}. This cannot be undone.`,
				actions: [
					{ label: "Cancel", variant: "outline", onClick: () => {} },
					{
						label: "Delete",
						variant: "destructive",
						onClick: () => void destroyOne(item),
					},
				],
			});
		},
		[deleteBranch, destroyOne],
	);

	const handleUnarchive = useCallback(
		async (item: HostWorkspaceItem) => {
			const restored = await unarchiveWorkspace({
				workspaceId: item.id,
				source: "settings",
			});
			if (restored) toast.success(`Restored "${item.name || item.branch}"`);
		},
		[unarchiveWorkspace],
	);

	// `hostReachable` (did the host actually answer its list query) is the
	// honest signal; a URL existing only means the Electric row says online.
	const deletableRows = rows.filter(
		(item) => item.hostReachable && cache.resolveHostUrl(item.hostId) !== null,
	);

	const handleDeleteAll = useCallback(() => {
		const targets = deletableRows;
		if (targets.length === 0) return;
		alert({
			title: "Delete all archived workspaces",
			description: `Permanently delete ${targets.length} archived workspace${targets.length === 1 ? "" : "s"}? This removes their worktrees from disk${deleteBranch ? " and deletes their local branches" : ""}. This cannot be undone.`,
			actions: [
				{ label: "Cancel", variant: "outline", onClick: () => {} },
				{
					label: "Delete all",
					variant: "destructive",
					onClick: async () => {
						// Sequential on purpose: the destroy saga runs git operations
						// and guards against concurrent deletes of the same workspace.
						let deleted = 0;
						for (const item of targets) {
							if (await destroyOne(item)) deleted += 1;
						}
						if (deleted === targets.length) {
							toast.success(
								`Deleted ${deleted} archived workspace${deleted === 1 ? "" : "s"}`,
							);
						} else {
							toast.warning(
								`Deleted ${deleted} of ${targets.length} archived workspaces — the rest need attention below`,
							);
						}
					},
				},
			],
		});
	}, [deletableRows, deleteBranch, destroyOne]);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">Archived workspaces</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Archived workspaces are hidden from the sidebar but keep their
						worktree and branch on disk. Restore them anytime, or delete them
						permanently here.
					</p>
				</div>
				{showDeleteAll && (
					<Button
						variant="destructive"
						size="sm"
						className="gap-2 shrink-0"
						disabled={deletableRows.length === 0}
						onClick={handleDeleteAll}
					>
						<HiOutlineTrash className="h-4 w-4" />
						Delete all
					</Button>
				)}
			</div>

			{showList &&
				(rows.length === 0 ? (
					isReady ? (
						<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
							<HiOutlineArchiveBox className="h-6 w-6 text-muted-foreground/60" />
							<p className="text-sm text-muted-foreground">
								No archived workspaces
							</p>
						</div>
					) : null
				) : (
					<div className="divide-y divide-border rounded-lg border border-border">
						{rows.map((item) => (
							<ArchivedWorkspaceRow
								key={item.id}
								workspace={item}
								status={rowStatus[item.id] ?? IDLE}
								hostReachable={
									item.hostReachable &&
									cache.resolveHostUrl(item.hostId) !== null
								}
								onUnarchive={() => void handleUnarchive(item)}
								onDelete={() => confirmDelete(item)}
								onForceDelete={() => void destroyOne(item, { force: true })}
								onDismissError={() => setStatus(item.id, IDLE)}
							/>
						))}
					</div>
				))}
		</div>
	);
}
