import { Trans, useLingui } from "@lingui/react/macro";
import { userMessageText } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import { ArrowUp, Trash2 } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
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
	const { t } = useLingui();
	if (prompts.length === 0) return null;
	return (
		<View className="overflow-hidden rounded-2xl border border-white/10 bg-[#1C1C1C]">
			<View className="flex-row items-center justify-between gap-3 px-3.5 pb-1 pt-2.5">
				<Text
					className="text-muted-foreground min-w-0 flex-1 text-xs font-medium"
					numberOfLines={1}
				>
					{paused ? (
						<Trans>Queue paused because you interrupted</Trans>
					) : (
						<Trans>Queued</Trans>
					)}
				</Text>
				{paused ? (
					<Pressable
						accessibilityRole="button"
						className="active:opacity-60"
						hitSlop={8}
						onPress={onResume}
					>
						<Text className="text-foreground text-xs font-semibold">
							<Trans>Resume</Trans>
						</Text>
					</Pressable>
				) : null}
			</View>
			<ScrollView className="max-h-72">
				{prompts.map((prompt) => (
					<View
						className="flex-row items-center gap-1 py-1.5 pl-3.5 pr-1.5"
						key={prompt.id}
					>
						<Text
							className="text-foreground min-w-0 flex-1 text-[17px]"
							numberOfLines={1}
						>
							{userMessageText(prompt, " ")}
						</Text>
						<Pressable
							accessibilityLabel={t({ message: "Steer" })}
							accessibilityRole="button"
							className="size-8 items-center justify-center active:opacity-60"
							onPress={() => onSteer(prompt.id)}
						>
							<View className="size-6 items-center justify-center rounded-full bg-white">
								<Icon as={ArrowUp} className="size-3.5 text-black" />
							</View>
						</Pressable>
						<Pressable
							accessibilityLabel={t({ message: "Delete" })}
							accessibilityRole="button"
							className="size-8 items-center justify-center active:opacity-60"
							onPress={() => onRemove(prompt.id)}
						>
							<Icon as={Trash2} className="text-muted-foreground size-4" />
						</Pressable>
					</View>
				))}
			</ScrollView>
		</View>
	);
}
