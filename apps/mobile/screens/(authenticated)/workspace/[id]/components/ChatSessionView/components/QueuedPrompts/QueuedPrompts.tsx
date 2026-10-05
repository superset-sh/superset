import { Trans } from "@lingui/react/macro";
import type { UserMessage } from "@superset/chat/protocol";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";

interface QueuedPromptsProps {
	prompts: UserMessage[];
	paused: boolean;
	onSteer: (itemId: string) => void;
	onRemove: (itemId: string) => void;
	onResume: () => void;
}

export function QueuedPrompts({
	prompts,
	paused,
	onSteer,
	onRemove,
	onResume,
}: QueuedPromptsProps) {
	if (prompts.length === 0) return null;
	return (
		<View className="border-border gap-2 rounded-lg border p-3">
			{paused ? (
				<View className="flex-row items-center justify-between gap-3">
					<Text className="text-muted-foreground min-w-0 flex-1 text-xs">
						<Trans>Queue paused because you interrupted</Trans>
					</Text>
					<Pressable accessibilityRole="button" onPress={onResume}>
						<Text className="text-foreground text-xs font-medium">
							<Trans>Resume</Trans>
						</Text>
					</Pressable>
				</View>
			) : (
				<Text className="text-muted-foreground text-xs">
					<Trans>Queued</Trans>
				</Text>
			)}
			{prompts.map((prompt) => (
				<View className="flex-row items-center gap-3" key={prompt.id}>
					<Text
						className="text-foreground min-w-0 flex-1 text-sm"
						numberOfLines={2}
					>
						{prompt.content
							.flatMap((part) => (part.type === "text" ? [part.text] : []))
							.join(" ")}
					</Text>
					<Pressable
						accessibilityRole="button"
						onPress={() => onSteer(prompt.id)}
					>
						<Text className="text-foreground text-xs font-medium">
							<Trans>Steer</Trans>
						</Text>
					</Pressable>
					<Pressable
						accessibilityRole="button"
						onPress={() => onRemove(prompt.id)}
					>
						<Text className="text-muted-foreground text-xs">
							<Trans>Delete</Trans>
						</Text>
					</Pressable>
				</View>
			))}
		</View>
	);
}
