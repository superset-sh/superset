import { prompt } from "@superset/alert-prompt";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { updateSession } from "@/lib/host/client";

export function SessionRowMenu({
	sessionId,
	title,
	routingKey,
	children,
}: {
	sessionId: string;
	title: string;
	/** Sessions host for menu actions; null renders the row without a menu. */
	routingKey: string | null;
	children: ReactNode;
}) {
	const queryClient = useQueryClient();
	const refreshList = () =>
		void queryClient.invalidateQueries({ queryKey: ["sessions", "list"] });

	const renameSession = async () => {
		if (!routingKey) return;
		const name = await prompt({
			title: "Rename chat",
			defaultValue: title,
			confirmText: "Rename",
			selectText: true,
		});
		const trimmed = name?.trim();
		if (!trimmed || trimmed === title) return;
		try {
			await updateSession(routingKey, { sessionId, title: trimmed });
			refreshList();
		} catch {
			Alert.alert("Rename failed");
		}
	};

	// The canonical surface has no hard delete; archiving removes the session
	// from every list while the host keeps the transcript.
	const archiveSession = () => {
		if (!routingKey) return;
		Alert.alert("Archive chat?", title, [
			{ style: "cancel", text: "Cancel" },
			{
				style: "destructive",
				text: "Archive",
				onPress: () => {
					updateSession(routingKey, { sessionId, archived: true })
						.then(refreshList)
						.catch(() => Alert.alert("Archive failed"));
				},
			},
		]);
	};

	if (!routingKey) return <>{children}</>;

	// The Link exists solely because Link.Menu must be a direct child of
	// Link; navigation is prevented and taps fall through to the row.
	return (
		<Link
			href="/(authenticated)/(home)"
			onPress={(event) => event.preventDefault()}
			asChild
		>
			<Link.Trigger>{children}</Link.Trigger>
			<Link.Menu>
				<Link.MenuAction icon="pencil" onPress={() => void renameSession()}>
					Rename
				</Link.MenuAction>
				<Link.MenuAction icon="archivebox" onPress={archiveSession}>
					Archive
				</Link.MenuAction>
			</Link.Menu>
		</Link>
	);
}
