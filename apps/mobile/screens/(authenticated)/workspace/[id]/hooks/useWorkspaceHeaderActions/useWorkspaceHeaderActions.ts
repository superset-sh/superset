import { prompt } from "@superset/alert-prompt";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Alert, Share } from "react-native";
import { useCloudWorkspaceActions } from "@/hooks/useCloudWorkspaceActions";
import type { HostWorkspaceRow } from "@/hooks/useHostWorkspaces";
import type { OrgHost } from "@/hooks/useOrgHosts";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { isTrpcErrorWithData } from "@/lib/host-service/errors";
import { isSandboxHost } from "@/lib/sandbox-access";
import { workspaceShareUrl } from "@/lib/web-links";

export function useWorkspaceHeaderActions(
	workspace: HostWorkspaceRow | null,
	host: OrgHost | null,
) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const cloud = useCloudWorkspaceActions();
	// A sandbox is its own host, keyed by the workspace's id; its name and its
	// lifetime belong to the cloud row, not to anything the sandbox serves.
	const isCloud = host !== null && isSandboxHost(host.machineId);

	const renameWorkspace = async () => {
		if (!workspace) return;
		if (!host) {
			Alert.alert("Host is not online");
			return;
		}
		const name = await prompt({
			title: "Rename workspace",
			defaultValue: workspace.name,
			confirmText: "Rename",
			selectText: true,
		});
		const trimmed = name?.trim();
		if (!trimmed || trimmed === workspace.name) return;
		try {
			if (isCloud) {
				await cloud.rename(workspace.id, trimmed);
			} else {
				const hostUrl = hostServiceUrl(host.organizationId, host.machineId);
				await getHostServiceClientByUrl(hostUrl).workspace.update.mutate({
					id: workspace.id,
					name: trimmed,
				});
			}
		} catch {
			Alert.alert("Rename failed");
		}
		void queryClient.invalidateQueries({
			queryKey: ["host-service", "workspaces", "list"],
		});
	};

	const destroyWorkspace = async ({
		force,
		skipTeardown,
	}: {
		/** Git-destructive consent only: skips the dirty-worktree preflight. */
		force: boolean;
		/** Consent to abandon the teardown script — set once it has already failed. */
		skipTeardown: boolean;
	}) => {
		if (!workspace || !host) return;
		const hostUrl = hostServiceUrl(host.organizationId, host.machineId);
		try {
			await getHostServiceClientByUrl(hostUrl).workspaceCleanup.destroy.mutate({
				workspaceId: workspace.id,
				deleteBranch: false,
				force,
				skipTeardown,
			});
			void queryClient.invalidateQueries({
				queryKey: ["host-service", "workspaces", "list"],
			});
			router.back();
		} catch (error) {
			if (isTrpcErrorWithData(error)) {
				if (error.data.deleteInProgress) {
					Alert.alert("Delete already in progress");
					return;
				}
				// A failing teardown script shouldn't hold the delete hostage on a
				// phone: it already ran, so let the workspace go without it.
				if (error.data.teardownFailure && !skipTeardown) {
					await destroyWorkspace({ force: true, skipTeardown: true });
					return;
				}
				if (error.data.code === "CONFLICT") {
					Alert.alert("Worktree has uncommitted changes", undefined, [
						{ style: "cancel", text: "Cancel" },
						{
							onPress: () =>
								void destroyWorkspace({ force: true, skipTeardown }),
							style: "destructive",
							text: "Delete anyway",
						},
					]);
					return;
				}
			}
			Alert.alert(
				"Delete failed",
				error instanceof Error ? error.message : undefined,
			);
		}
	};

	const deleteWorkspace = () => {
		if (!workspace) return;
		if (!host) {
			Alert.alert("Host is not online");
			return;
		}
		if (isCloud) {
			Alert.alert(
				"Delete cloud workspace",
				`Delete "${workspace.name}"? This shuts down its sandbox and everything in it.`,
				[
					{ style: "cancel", text: "Cancel" },
					{
						onPress: () =>
							void cloud
								.remove(workspace.id)
								.then(() => router.back())
								.catch(() => Alert.alert("Delete failed")),
						style: "destructive",
						text: "Delete",
					},
				],
			);
			return;
		}
		Alert.alert(
			"Delete workspace",
			`Delete "${workspace.name}"? This removes its worktree from the host.`,
			[
				{ style: "cancel", text: "Cancel" },
				{
					onPress: () =>
						void destroyWorkspace({ force: false, skipTeardown: false }),
					style: "destructive",
					text: "Delete",
				},
			],
		);
	};

	const copyId = () => {
		if (workspace) void Clipboard.setStringAsync(workspace.id);
	};

	const shareWorkspace = () => {
		if (!workspace) return;
		void Share.share({
			url: workspaceShareUrl(workspace.id),
		});
	};

	return {
		renameWorkspace,
		deleteWorkspace,
		copyId,
		shareWorkspace,
	};
}
