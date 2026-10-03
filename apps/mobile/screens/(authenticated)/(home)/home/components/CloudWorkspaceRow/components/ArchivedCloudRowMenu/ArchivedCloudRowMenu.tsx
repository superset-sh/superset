import { useLingui } from "@lingui/react/macro";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { useCloudWorkspaceActions } from "@/hooks/useCloudWorkspaceActions";
import { itemFromCloudRow } from "@/hooks/useCloudWorkspaceItems";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import type { HostWorkspacesCacheOps } from "@/hooks/useHostWorkspaces";
import { useWorkspaceRowActions } from "../../../WorkspaceRow/hooks/useWorkspaceRowActions";

export function ArchivedCloudRowMenu({
	row,
	cache,
	onCopied,
	children,
}: {
	row: CloudWorkspaceRow;
	cache: HostWorkspacesCacheOps;
	onCopied: () => void;
	children: ReactNode;
}) {
	const { t } = useLingui();
	const { unarchive } = useCloudWorkspaceActions();
	const { copyId, shareWorkspace } = useWorkspaceRowActions(
		itemFromCloudRow(row),
		cache,
		[],
		row.status,
		onCopied,
	);
	return (
		<Link
			href="/(authenticated)/(home)"
			onPress={(event) => event.preventDefault()}
			asChild
		>
			<Link.Trigger>{children}</Link.Trigger>
			<Link.Menu>
				<Link.MenuAction
					icon="arrow.uturn.backward"
					onPress={() =>
						void unarchive(row.id).catch(() =>
							Alert.alert(t({ message: "Unarchive failed" })),
						)
					}
				>
					{t({ message: "Unarchive" })}
				</Link.MenuAction>
				<Link.Menu inline>
					<Link.MenuAction icon="doc.on.doc" onPress={copyId}>
						{t({ message: "Copy ID" })}
					</Link.MenuAction>
					<Link.MenuAction icon="square.and.arrow.up" onPress={shareWorkspace}>
						{t({ message: "Share" })}
					</Link.MenuAction>
				</Link.Menu>
			</Link.Menu>
		</Link>
	);
}
