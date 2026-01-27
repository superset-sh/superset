import type { MessageRow } from "@superset/ai-chat/stream";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

export interface ChatMessageProps {
	message: MessageRow;
	isCurrentUser: boolean;
}

export function ChatMessage({ message, isCurrentUser }: ChatMessageProps) {
	const alignment = isCurrentUser ? "items-end" : "items-start";
	const bgColor = isCurrentUser ? "bg-primary" : "bg-muted";
	const textColor = isCurrentUser
		? "text-primary-foreground"
		: "text-foreground";

	return (
		<View className={`px-4 py-1 ${alignment}`}>
			<View className={`max-w-[85%] ${bgColor} rounded-2xl px-4 py-2`}>
				{!isCurrentUser && message.role !== "user" && (
					<Text className={`text-xs ${textColor} opacity-70 mb-1`}>
						{message.role}
					</Text>
				)}
				<Text className={textColor}>{message.content}</Text>
				<Text className={`text-xs ${textColor} opacity-50 mt-1`}>
					{formatTime(message.createdAt)}
				</Text>
			</View>
		</View>
	);
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
