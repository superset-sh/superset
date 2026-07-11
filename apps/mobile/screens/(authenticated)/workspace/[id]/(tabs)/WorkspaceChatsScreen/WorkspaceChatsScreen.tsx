import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { SessionRow } from "@/screens/(authenticated)/(home)/home/components/SessionRow";
import { useHostAcpSessions } from "@/screens/(authenticated)/(home)/home/hooks/useHostAcpSessions";
import { buildSessionRows } from "@/screens/(authenticated)/(home)/home/utils/sessionRows";

export function WorkspaceChatsScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();

	const { host } = useWorkspaceHost(id ?? null);
	const { sessionsByWorkspace, isReady } = useHostAcpSessions(host);
	const sessionRows = useMemo(
		() => buildSessionRows(id ? (sessionsByWorkspace.get(id) ?? []) : []),
		[sessionsByWorkspace, id],
	);

	return (
		<ScrollView
			className="bg-background flex-1"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{ paddingTop: 4, paddingBottom: 16 }}
		>
			{sessionRows.map((row, index) => (
				<View key={row.id}>
					{index > 0 && <View className="border-border/40 ml-12 border-t" />}
					<SessionRow
						row={row}
						className="px-4 py-3"
						onPress={() =>
							router.push(`/(authenticated)/workspace/${id}/chat/acp/${row.id}`)
						}
					/>
				</View>
			))}
			{sessionRows.length === 0 && isReady && (
				<View className="items-center py-20">
					<Text className="text-muted-foreground">
						No chats in this workspace yet
					</Text>
				</View>
			)}
		</ScrollView>
	);
}
