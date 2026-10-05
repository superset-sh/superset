import { Trans } from "@lingui/react/macro";
import { readBookkeeping } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import { Paperclip } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

interface UserMessageBubbleProps {
	content: UserContent[];
	harness: string | undefined;
	pending?: {
		failed: boolean;
		onRetry: () => void;
		onDiscard: () => void;
	};
}

export function UserMessageBubble({
	content,
	harness,
	pending,
}: UserMessageBubbleProps) {
	const text = content
		.flatMap((part) => (part.type === "text" ? [part.text] : []))
		.join("\n");
	const note = pending ? null : readBookkeeping(harness, text);
	if (note) {
		return (
			<Text className="text-muted-foreground/70 text-xs" numberOfLines={1}>
				{note.label}
			</Text>
		);
	}

	const attachments = content.flatMap((part) =>
		part.type === "attachment" ? [part] : [],
	);
	return (
		<Message from="user">
			<MessageContent className={pending ? "opacity-70" : undefined}>
				{text ? <Text selectable>{text}</Text> : null}
				{attachments.map((attachment) => (
					<View
						className="flex-row items-center gap-1.5"
						key={attachment.attachmentId}
					>
						<Icon as={Paperclip} className="text-muted-foreground size-3" />
						<Text className="text-muted-foreground text-xs" numberOfLines={1}>
							{attachment.name}
						</Text>
					</View>
				))}
			</MessageContent>
			{pending ? (
				<View className="flex-row items-center justify-end gap-3">
					{pending.failed ? (
						<>
							<Text className="text-destructive text-xs">
								<Trans>Not sent</Trans>
							</Text>
							<Pressable accessibilityRole="button" onPress={pending.onRetry}>
								<Text className="text-foreground text-xs font-medium">
									<Trans>Retry</Trans>
								</Text>
							</Pressable>
							<Pressable accessibilityRole="button" onPress={pending.onDiscard}>
								<Text className="text-muted-foreground text-xs">
									<Trans>Discard</Trans>
								</Text>
							</Pressable>
						</>
					) : (
						<Text className="text-muted-foreground text-xs">
							<Trans>Sending…</Trans>
						</Text>
					)}
				</View>
			) : null}
		</Message>
	);
}
