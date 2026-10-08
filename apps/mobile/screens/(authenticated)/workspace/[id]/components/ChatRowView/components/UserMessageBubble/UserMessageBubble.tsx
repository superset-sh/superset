import { Trans } from "@lingui/react/macro";
import { readBookkeeping, userMessageText } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import { CircleAlert, Paperclip } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SystemLine } from "../SystemLine";
import { OutgoingBubble } from "./components/OutgoingBubble";

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
	const text = userMessageText({ content });
	const note = pending ? null : readBookkeeping(harness, text);
	if (note) return <SystemLine>{note.label}</SystemLine>;

	const attachments = content.flatMap((part) =>
		part.type === "attachment" ? [part] : [],
	);
	const failed = pending?.failed === true;
	return (
		<View className="items-end gap-1">
			<View className="flex-row items-center justify-end gap-2">
				{failed ? (
					<Pressable
						accessibilityRole="button"
						hitSlop={8}
						onPress={pending?.onRetry}
					>
						<Icon as={CircleAlert} className="text-destructive size-5" />
					</Pressable>
				) : null}
				<OutgoingBubble dimmed={pending !== undefined}>
					{text ? (
						<Text
							className="text-foreground text-[17px] leading-[24px]"
							selectable
						>
							{text}
						</Text>
					) : null}
					{attachments.map((attachment) => (
						<View
							className="flex-row items-center gap-1.5 rounded-xl bg-white/10 px-2.5 py-1.5"
							key={attachment.attachmentId}
						>
							<Icon as={Paperclip} className="size-3 text-white" />
							<Text
								className="min-w-0 shrink text-xs text-white"
								numberOfLines={1}
							>
								{attachment.name}
							</Text>
						</View>
					))}
				</OutgoingBubble>
			</View>
			{pending ? (
				<View className="flex-row items-center justify-end gap-3 pr-1">
					{failed ? (
						<>
							<Text className="text-destructive text-[11px] font-medium">
								<Trans>Not sent</Trans>
							</Text>
							<Pressable
								accessibilityRole="button"
								hitSlop={8}
								onPress={pending.onRetry}
							>
								<Text className="text-foreground text-[11px] font-semibold">
									<Trans>Retry</Trans>
								</Text>
							</Pressable>
							<Pressable
								accessibilityRole="button"
								hitSlop={8}
								onPress={pending.onDiscard}
							>
								<Text className="text-muted-foreground text-[11px]">
									<Trans>Discard</Trans>
								</Text>
							</Pressable>
						</>
					) : (
						<Text className="text-muted-foreground text-[11px]">
							<Trans>Sending…</Trans>
						</Text>
					)}
				</View>
			) : null}
		</View>
	);
}
