import { prompt } from "@superset/alert-prompt";
import * as Clipboard from "expo-clipboard";
import { Link, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Alert, Share } from "react-native";
import type {
	HostWorkspaceItem,
	HostWorkspacesCacheOps,
} from "@/hooks/useHostWorkspaces";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { isTrpcErrorWithData } from "@/lib/host-service/errors";

export function WorkspaceRowMenu({
	workspace,
	cache,
	children,
}: {
	workspace: HostWorkspaceItem;
	cache: HostWorkspacesCacheOps;
	children: ReactNode;
}) {
	const router = useRouter();
	const renameWorkspace = async () => {
		const hostUrl = cache.resolveHostUrl(workspace.hostId);
		if (!hostUrl) {
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
			await getHostServiceClientByUrl(hostUrl).workspace.update.mutate({
				id: workspace.id,
				name: trimmed,
			});
		} catch {
			Alert.alert("Rename failed");
		}
		cache.invalidateHost(workspace.hostId);
	};

	const destroyWorkspace = async (force: boolean) => {
		const hostUrl = cache.resolveHostUrl(workspace.hostId);
		if (!hostUrl) {
			Alert.alert("Host is not online");
			return;
		}
		try {
			await getHostServiceClientByUrl(hostUrl).workspaceCleanup.destroy.mutate({
				workspaceId: workspace.id,
				deleteBranch: false,
				force,
			});
			cache.removeWorkspace(workspace.hostId, workspace.id);
		} catch (error) {
			if (isTrpcErrorWithData(error)) {
				if (error.data.deleteInProgress) {
					Alert.alert("Delete already in progress");
					return;
				}
				if (error.data.code === "CONFLICT" || error.data.teardownFailure) {
					Alert.alert(
						error.data.teardownFailure
							? "Teardown script failed"
							: "Worktree has uncommitted changes",
						undefined,
						[
							{ style: "cancel", text: "Cancel" },
							{
								onPress: () => void destroyWorkspace(true),
								style: "destructive",
								text: "Force delete",
							},
						],
					);
					return;
				}
			}
			Alert.alert("Delete failed");
		}
	};

	const deleteWorkspace = () => {
		if (!cache.resolveHostUrl(workspace.hostId)) {
			Alert.alert("Host is not online");
			return;
		}
		Alert.alert(
			"Delete workspace",
			`Delete "${workspace.name}"? This removes its worktree from the host.`,
			[
				{ style: "cancel", text: "Cancel" },
				{
					onPress: () => void destroyWorkspace(false),
					style: "destructive",
					text: "Delete",
				},
			],
		);
	};

	// The workspace has no screen of its own anymore — sessions are inline on
	// home — so the row only long-presses into the menu; tap is a no-op (the
	// Link exists solely because Link.Menu must be a direct child of Link).
	return (
		<Link
			href="/(authenticated)/(home)"
			onPress={(event) => event.preventDefault()}
			asChild
		>
			<Link.Trigger>{children}</Link.Trigger>
			<Link.Menu>
				<Link.MenuAction
					icon="terminal"
					onPress={() =>
						router.push(`/(authenticated)/workspace/${workspace.id}/chat/acp`)
					}
				>
					Live sessions
				</Link.MenuAction>
				<Link.MenuAction icon="pencil" onPress={() => void renameWorkspace()}>
					Rename
				</Link.MenuAction>
				{workspace.type !== "main" ? (
					<Link.MenuAction icon="trash" onPress={deleteWorkspace}>
						Delete
					</Link.MenuAction>
				) : null}
				<Link.Menu inline>
					<Link.MenuAction
						icon="doc.on.doc"
						onPress={() => void Clipboard.setStringAsync(workspace.id)}
					>
						Copy ID
					</Link.MenuAction>
					<Link.MenuAction
						icon="square.and.arrow.up"
						onPress={() =>
							void Share.share({
								url: `https://app.superset.sh/workspaces/${workspace.id}`,
							})
						}
					>
						Share
					</Link.MenuAction>
				</Link.Menu>
			</Link.Menu>
		</Link>
	);
}
