import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import {
	FlatList,
	type FlatListProps,
	type ListRenderItemInfo,
	View,
} from "react-native";
import {
	AssistantMessageHead,
	type AssistantMessageHeadVariant,
} from "@/components/AssistantMessageHead";
import {
	CollapsedBlock,
	type CollapsedBlockKind,
} from "@/components/CollapsedBlock";
import { ToolCallCard, type ToolCallStatus } from "@/components/ToolCallCard";
import { UserMessageBubble } from "@/components/UserMessageBubble";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type ChatThreadItem =
	| {
			id: string;
			kind: "user";
			message: string;
			timestamp?: string;
			failed?: boolean;
			variant?: "default" | "accent" | "pending";
	  }
	| {
			id: string;
			kind: "assistant-head";
			timestamp: string;
			variant?: AssistantMessageHeadVariant;
			initials?: string;
			completedDuration?: string;
	  }
	| {
			id: string;
			kind: "assistant-body";
			body: ReactNode;
	  }
	| {
			id: string;
			kind: "tool-call";
			name: string;
			args?: string;
			status?: ToolCallStatus;
			icon?: LucideIcon;
			duration?: string;
	  }
	| {
			id: string;
			kind: "collapsed-block";
			blockKind: CollapsedBlockKind;
			meta?: string;
			defaultOpen?: boolean;
			children?: ReactNode;
	  };

export type ChatThreadProps = Omit<
	FlatListProps<ChatThreadItem>,
	"data" | "renderItem" | "keyExtractor"
> & {
	items: ReadonlyArray<ChatThreadItem>;
	onUserMessageLongPress?: (
		item: Extract<ChatThreadItem, { kind: "user" }>,
	) => void;
	onUserMessageRetry?: (
		item: Extract<ChatThreadItem, { kind: "user" }>,
	) => void;
	onToolCallPress?: (
		item: Extract<ChatThreadItem, { kind: "tool-call" }>,
	) => void;
};

/**
 * Scrollable message thread. Composes user/assistant message molecules, tool
 * call cards, and collapsible reasoning/plan/subagent blocks via a typed
 * discriminated-union item list. UC-RENDER-01..06.
 *
 * Item ordering responsibility belongs to the caller (chat state machine);
 * this organism only renders. Use AssistantMessageHead followed by
 * assistant-body items to compose a single assistant turn — the head is a
 * separate item so the body can stream into its own row.
 */
export function ChatThread({
	items,
	onUserMessageLongPress,
	onUserMessageRetry,
	onToolCallPress,
	contentContainerStyle,
	className,
	...listProps
}: ChatThreadProps) {
	const renderItem = ({ item }: ListRenderItemInfo<ChatThreadItem>) => {
		switch (item.kind) {
			case "user":
				return (
					<View className="px-4">
						<UserMessageBubble
							message={item.message}
							timestamp={item.timestamp}
							failed={item.failed}
							variant={item.variant ?? "default"}
							onLongPress={() => onUserMessageLongPress?.(item)}
							onRetry={
								item.failed ? () => onUserMessageRetry?.(item) : undefined
							}
						/>
					</View>
				);
			case "assistant-head":
				return (
					<View className="px-4">
						<AssistantMessageHead
							timestamp={item.timestamp}
							variant={item.variant}
							initials={item.initials}
							completedDuration={item.completedDuration}
						/>
					</View>
				);
			case "assistant-body":
				return <View className="px-4 pl-12">{item.body}</View>;
			case "tool-call":
				return (
					<View className="px-4 pl-12">
						<ToolCallCard
							name={item.name}
							args={item.args}
							status={item.status}
							icon={item.icon}
							duration={item.duration}
							onPress={() => onToolCallPress?.(item)}
						/>
					</View>
				);
			case "collapsed-block":
				return (
					<View className="px-4 pl-12">
						<CollapsedBlock
							kind={item.blockKind}
							meta={item.meta}
							defaultOpen={item.defaultOpen}
						>
							{item.children}
						</CollapsedBlock>
					</View>
				);
		}
	};

	return (
		<FlatList<ChatThreadItem>
			data={items as ChatThreadItem[]}
			renderItem={renderItem}
			keyExtractor={(item) => item.id}
			ItemSeparatorComponent={ChatThreadSeparator}
			contentContainerStyle={[
				{ paddingVertical: 16, gap: 0 },
				contentContainerStyle,
			]}
			className={cn("flex-1", className)}
			{...listProps}
		/>
	);
}

function ChatThreadSeparator() {
	return <View className="h-2" />;
}

/** Type guard helper for callers building item arrays. */
export function chatThreadAssistantBody(
	text: string,
	id: string,
): ChatThreadItem {
	return {
		id,
		kind: "assistant-body",
		body: <Text className="text-foreground">{text}</Text>,
	};
}
