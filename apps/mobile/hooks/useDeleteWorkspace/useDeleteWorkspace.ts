import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Alert } from "react-native";
import { useCloudWorkspaceActions } from "@/hooks/useCloudWorkspaceActions";
import {
	getHostWorkspacesQueryKey,
	type HostWorkspaceRow,
} from "@/hooks/useHostWorkspaces";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { isTrpcErrorWithData } from "@/lib/host-service/errors";

export interface DeleteWorkspaceTarget {
	id: string;
	name: string;
	/** Host owning the worktree. Unused for a cloud workspace. */
	hostId: string | null;
	/** Where that host answers — null when it is offline. */
	hostUrl: string | null;
	/** Only the API can destroy a cloud workspace; its sandbox cannot. */
	isCloud: boolean;
}

/** Codes the relay answers with itself, about its tunnel and not the delete. */
const RELAY_ERROR_CODES = new Set(["BAD_GATEWAY", "SERVICE_UNAVAILABLE"]);

/**
 * Confirm, then delete a workspace: the row leaves the list the moment the
 * user confirms and the destroy runs unattended.
 *
 * Waiting on the mutation is what made this feel broken on a phone.
 * host-service archives the row *before* any slow work, and that archive is
 * the commit point, so the 10-20s a teardown script and a worktree removal
 * take are all spent after the delete is already decided. Worse, past the
 * relay's 30s exchange cap the client is handed `BAD_GATEWAY: Request timed
 * out` for a delete that committed.
 *
 * The confirm is the whole gate. `force` goes out with every destroy rather
 * than preflighting for uncommitted work first: on a phone the answer to
 * "this worktree is dirty" is yes anyway — agent work is cheap to redo — and
 * a second alert after a refused destroy costs more than it protects.
 * Teardown still runs; `force` is git consent only.
 *
 * `onConfirmed` fires at that commit point, so a caller showing the workspace
 * can leave for the list instead of sitting on a screen whose row is gone.
 */
export function useDeleteWorkspace() {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const cloud = useCloudWorkspaceActions();

	return useCallback(
		(target: DeleteWorkspaceTarget, onConfirmed?: () => void) => {
			if (target.isCloud) {
				Alert.alert(
					t({
						message: "Delete cloud workspace",
					}),
					t({
						message: `Delete "${target.name}"? This shuts down its sandbox and everything in it.`,
					}),
					[
						{
							style: "cancel",
							text: t({ message: "Cancel" }),
						},
						{
							onPress: () => {
								onConfirmed?.();
								void cloud.remove(target.id).catch(() =>
									Alert.alert(
										t({
											message: "Delete failed",
										}),
									),
								);
							},
							style: "destructive",
							text: t({
								message: "Delete",
							}),
						},
					],
				);
				return;
			}

			const { hostId, hostUrl } = target;
			if (!hostId || !hostUrl) {
				Alert.alert(
					t({
						message: "Host is not online",
					}),
				);
				return;
			}
			const client = getHostServiceClientByUrl(hostUrl);
			const listKey = getHostWorkspacesQueryKey(hostId, hostUrl);

			const destroy = async (skipTeardown: boolean): Promise<void> => {
				try {
					await client.workspaceCleanup.destroy.mutate({
						workspaceId: target.id,
						deleteBranch: false,
						force: true,
						skipTeardown,
					});
				} catch (error) {
					if (isTrpcErrorWithData(error)) {
						// Another destroy already owns this workspace and will
						// either finish it or un-archive it.
						if (error.data.deleteInProgress) return;
						// A failing teardown script shouldn't hold the delete
						// hostage on a phone: it already ran, so let the workspace
						// go without it.
						if (error.data.teardownFailure && !skipTeardown) {
							await destroy(true);
							return;
						}
					}
					// The host archives the row before any slow work, so a fresh
					// list without it means the delete committed and only the
					// relay gave up waiting (its 30s cap is shorter than a
					// teardown script's). Ask the host directly: a cache refetch
					// that fails leaves the optimistic removal behind and would
					// read as success.
					const rows = await client.workspace.list.query().catch(() => null);
					if (rows && !rows.some((row) => row.id === target.id)) return;
					void queryClient.invalidateQueries({ queryKey: listKey });
					Alert.alert(
						t({
							message: "Delete failed",
						}),
						failureDetail(error),
					);
				}
			};

			Alert.alert(
				t({
					message: "Delete workspace",
				}),
				t({
					message: `Delete "${target.name}"? This removes its worktree from the host.`,
				}),
				[
					{
						style: "cancel",
						text: t({ message: "Cancel" }),
					},
					{
						onPress: () => {
							// Drop the row now. The host's archive lands within
							// milliseconds and every later refetch agrees; a failure
							// un-archives and the invalidate above brings it back.
							queryClient.setQueryData<HostWorkspaceRow[]>(listKey, (rows) =>
								rows?.filter((row) => row.id !== target.id),
							);
							onConfirmed?.();
							void destroy(false);
						},
						style: "destructive",
						text: t({
							message: "Delete",
						}),
					},
				],
			);
		},
		[cloud, queryClient, t],
	);
}

/**
 * What to put under "Delete failed". The relay's own messages describe its
 * tunnel — "Request timed out" at the 30s exchange cap — and the caller only
 * reaches here once a fresh list has proved the workspace is still on the
 * host, so they would name the wrong problem.
 */
function failureDetail(error: unknown): string | undefined {
	if (
		isTrpcErrorWithData(error) &&
		RELAY_ERROR_CODES.has(error.data.code ?? "")
	) {
		return undefined;
	}
	return error instanceof Error ? error.message : undefined;
}
