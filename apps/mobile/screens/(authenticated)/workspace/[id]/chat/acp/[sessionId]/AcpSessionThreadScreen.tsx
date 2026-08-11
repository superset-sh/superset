import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { useHostAcpSessions } from "@/screens/(authenticated)/(home)/home/hooks/useHostAcpSessions";
import { useHostRoutingKey } from "../../../hooks/useHostRoutingKey";
import { SessionThread } from "./components/SessionThread";

/**
 * Gate that resolves the host routing key (from the synced collections)
 * before mounting the live thread. Auth tokens are minted lazily per
 * request/connect inside lib/host/client, so no token gate is needed here.
 */
export function AcpSessionThreadScreen() {
	const { id, sessionId } = useLocalSearchParams<{
		id: string;
		sessionId: string;
	}>();
	const routingKey = useHostRoutingKey(id);

	const { workspace, host } = useWorkspaceHost(id ?? null);
	const { sessionsByWorkspace } = useHostAcpSessions(host);
	const session = id
		? sessionsByWorkspace
				.get(id)
				?.find((candidate) => candidate.sessionId === sessionId)
		: undefined;

	if (!sessionId) return null;

	const header = (
		<Stack.Title asChild>
			<View className="max-w-52 items-center">
				<Text className="font-semibold text-[17px]" numberOfLines={1}>
					{session?.title ?? "New session"}
				</Text>
				{workspace?.name ? (
					<Text className="text-muted-foreground text-xs" numberOfLines={1}>
						{workspace.name}
					</Text>
				) : null}
			</View>
		</Stack.Title>
	);

	if (!routingKey) {
		return (
			<View className="bg-background flex-1 items-center justify-center">
				{header}
				<ActivityIndicator />
			</View>
		);
	}

	return (
		<>
			{header}
			<SessionThread routingKey={routingKey} sessionId={sessionId} />
		</>
	);
}
