import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, View } from "react-native";
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

	if (!sessionId) return null;

	if (!routingKey) {
		return (
			<View className="bg-background flex-1 items-center justify-center">
				<ActivityIndicator />
			</View>
		);
	}

	return <SessionThread routingKey={routingKey} sessionId={sessionId} />;
}
