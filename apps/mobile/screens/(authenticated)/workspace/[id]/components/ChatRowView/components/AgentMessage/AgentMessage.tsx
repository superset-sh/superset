import { useLingui } from "@lingui/react/macro";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Check, Copy, GitBranch } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { MessageResponse } from "@/components/ai-elements/message";
import { Icon } from "@/components/ui/icon";
import { AGENT_MARKDOWN_STYLE } from "./constants";

const COPIED_MS = 1500;

export function AgentMessage({
	text,
	showActions,
	onBranch,
}: {
	text: string;
	showActions: boolean;
	onBranch: () => void;
}) {
	const { t } = useLingui();
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), COPIED_MS);
		return () => clearTimeout(timer);
	}, [copied]);

	const copy = () => {
		void Clipboard.setStringAsync(text);
		void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
		setCopied(true);
	};

	return (
		<View className="w-full gap-1">
			<Pressable
				delayLongPress={300}
				onLongPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
					onBranch();
				}}
			>
				<MessageResponse markdownStyle={AGENT_MARKDOWN_STYLE}>
					{text}
				</MessageResponse>
			</Pressable>
			{showActions ? (
				<View className="-ml-1.5 flex-row items-center">
					<Pressable
						accessibilityLabel={
							copied ? t({ message: "Copied" }) : t({ message: "Copy message" })
						}
						accessibilityRole="button"
						className="size-7 items-center justify-center rounded-md active:bg-white/10"
						onPress={copy}
					>
						<Icon
							as={copied ? Check : Copy}
							className="text-muted-foreground size-3.5"
						/>
					</Pressable>
					<Pressable
						accessibilityLabel={t({ message: "Branch from here" })}
						accessibilityRole="button"
						className="size-7 items-center justify-center rounded-md active:bg-white/10"
						onPress={onBranch}
					>
						<Icon as={GitBranch} className="text-muted-foreground size-3.5" />
					</Pressable>
				</View>
			) : null}
		</View>
	);
}
