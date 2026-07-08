import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";

export function ChatThreadScreen() {
	const { sessionId } = useLocalSearchParams<{
		id: string;
		sessionId: string;
	}>();

	return (
		<View className="bg-background flex-1">
			<ConversationEmptyState
				title="Chat coming soon"
				description={`Session ${sessionId} will render here once the chat runtime is wired up.`}
			/>
		</View>
	);
}
