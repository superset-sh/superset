import type { FoldedTimeline, TimelineItem } from "@superset/session-protocol";
import { ActivityIndicator, View } from "react-native";
import {
	Conversation,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Text } from "@/components/ui/text";
import { MessageItemView } from "./components/MessageItemView";
import { ToolCallItemView } from "./components/ToolCallItemView";

export function SessionTimeline({
	timeline,
	isLoading,
	isRunning,
	topInset,
}: {
	timeline: FoldedTimeline;
	isLoading: boolean;
	isRunning: boolean;
	topInset: number;
}) {
	return (
		<Conversation
			contentContainerClassName="px-4 pb-4 gap-3"
			contentContainerStyle={{ paddingTop: topInset + 16 }}
			data={timeline.items}
			keyExtractor={(item) => item.id}
			ListFooterComponent={isRunning ? WorkingIndicator : undefined}
			renderItem={({ item }) => <TimelineItemView item={item} />}
		>
			{timeline.items.length === 0 ? (
				<ConversationEmptyState
					description={
						isLoading ? undefined : "Send a message to start the SDK session."
					}
					title={isLoading ? "Connecting to Claude…" : "No messages yet"}
				/>
			) : null}
			<ConversationScrollButton />
		</Conversation>
	);
}

function TimelineItemView({ item }: { item: TimelineItem }) {
	switch (item.kind) {
		case "message":
			return <MessageItemView item={item} />;
		case "tool_call":
			return <ToolCallItemView item={item} />;
		case "user_dialog":
			return (
				<Text className="text-muted-foreground text-xs">
					Dialog {item.request.dialogKind}:{" "}
					{item.response ? "resolved" : "waiting"}
				</Text>
			);
		case "elicitation":
			return (
				<Text className="text-muted-foreground text-xs">
					{item.request.serverName}: {item.response ? "resolved" : "waiting"}
				</Text>
			);
	}
}

function WorkingIndicator() {
	return (
		<View className="items-start">
			<View className="bg-card border-border flex-row items-center gap-2 rounded-2xl border px-3 py-2">
				<ActivityIndicator size="small" />
				<Text className="text-muted-foreground text-xs">working…</Text>
			</View>
		</View>
	);
}
