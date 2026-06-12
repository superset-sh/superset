import { useLiveQuery } from "@tanstack/react-db";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { WorkspaceBackButton } from "@/screens/(authenticated)/workspace/[id]/components/WorkspaceBackButton";

export function ChatSessionsScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const collections = useCollections();

	const { data: sessions } = useLiveQuery(
		(q) => q.from({ chatSessions: collections.chatSessions }),
		[collections],
	);

	const workspaceSessions = (sessions ?? [])
		.filter((session) => session.v2WorkspaceId === id)
		.sort(
			(a, b) =>
				new Date(b.updatedAt ?? b.createdAt).getTime() -
				new Date(a.updatedAt ?? a.createdAt).getTime(),
		);

	return (
		<>
			<WorkspaceBackButton />
			<FlatList
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
				data={workspaceSessions}
				keyExtractor={(item) => item.id}
				contentContainerClassName="p-4 pb-28 gap-2"
				ListEmptyComponent={
					<View className="items-center justify-center py-20">
						<Text className="text-center text-muted-foreground">
							No chat sessions yet
						</Text>
					</View>
				}
				renderItem={({ item }) => (
					<Pressable
						className="bg-card border-border active:bg-accent rounded-xl border p-4"
						onPress={() =>
							router.push(`/(authenticated)/workspace/${id}/chat/${item.id}`)
						}
					>
						<Text className="font-medium" numberOfLines={1}>
							{item.title ?? "Untitled chat"}
						</Text>
						<Text className="text-muted-foreground mt-1 text-xs">
							{new Date(item.updatedAt ?? item.createdAt).toLocaleString()}
						</Text>
					</Pressable>
				)}
			/>
		</>
	);
}
