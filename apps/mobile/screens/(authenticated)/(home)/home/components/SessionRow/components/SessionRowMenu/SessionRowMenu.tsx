import { prompt } from "@superset/alert-prompt";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { apiClient } from "@/lib/trpc/client";

export function SessionRowMenu({
	sessionId,
	title,
	children,
}: {
	sessionId: string;
	title: string;
	children: ReactNode;
}) {
	const renameSession = async () => {
		const name = await prompt({
			title: "Rename chat",
			defaultValue: title,
			confirmText: "Rename",
			selectText: true,
		});
		const trimmed = name?.trim();
		if (!trimmed || trimmed === title) return;
		try {
			await apiClient.chat.updateSession.mutate({
				sessionId,
				title: trimmed,
			});
		} catch {
			Alert.alert("Rename failed");
		}
	};

	const deleteSession = () => {
		Alert.alert("Delete chat?", title, [
			{ style: "cancel", text: "Cancel" },
			{
				style: "destructive",
				text: "Delete",
				onPress: () => {
					apiClient.chat.deleteSession
						.mutate({ sessionId })
						.catch(() => Alert.alert("Delete failed"));
				},
			},
		]);
	};

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
				<Link.MenuAction icon="trash" onPress={deleteSession}>
					Delete
				</Link.MenuAction>
				<Link.Menu inline>
					<Link.MenuAction
						icon="arrow.branch"
						onPress={() => Alert.alert("Forking is not available yet")}
					>
						Fork
					</Link.MenuAction>
				</Link.Menu>
			</Link.Menu>
		</Link>
	);
}
