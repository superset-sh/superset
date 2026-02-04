import type { ChatUser } from "@superset/ai-chat/stream";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

export interface PresenceBarProps {
	users: ChatUser[];
	currentUserId?: string;
}

export function PresenceBar({ users, currentUserId }: PresenceBarProps) {
	const otherUsers = users.filter((u) => u.userId !== currentUserId);

	if (otherUsers.length === 0) {
		return null;
	}

	const displayNames =
		otherUsers.length <= 3
			? otherUsers.map((u) => u.name).join(", ")
			: `${otherUsers
					.slice(0, 2)
					.map((u) => u.name)
					.join(", ")} +${otherUsers.length - 2}`;

	return (
		<View className="px-4 py-2 bg-muted/50 border-b border-border">
			<Text className="text-sm text-muted-foreground">
				{displayNames} {otherUsers.length === 1 ? "is" : "are"} here
			</Text>
		</View>
	);
}
