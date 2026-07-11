import { useLiveQuery } from "@tanstack/react-db";
import { Stack, useLocalSearchParams } from "expo-router";
// Imported from expo-router's vendored copy on purpose: this reads the SAME
// HeaderHeightContext that expo-router's Stack populates. Declaring
// `@react-navigation/elements` as our own dep would pull a second copy with a
// different context instance and always return 0.
import { useHeaderHeight } from "expo-router/build/react-navigation/elements/Header/useHeaderHeight";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	View,
} from "react-native";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Text } from "@/components/ui/text";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { GlassHeaderTitle } from "../components/GlassHeaderTitle";
import { ChatComposer } from "./components/ChatComposer";
import { ChatMessageList } from "./components/ChatMessageList";
import { ChatPendingActions } from "./components/ChatPendingActions";
import type { ChatMessage } from "./hooks/useChatThread";
import { useChatThread } from "./hooks/useChatThread";

export function ChatThreadScreen() {
	const { id, sessionId } = useLocalSearchParams<{
		id: string;
		sessionId: string;
	}>();

	const chat = useChatThread({ sessionId, workspaceId: id });

	// Resolve the session title for the nav header (cache-first: render whatever
	// synced row we have; blank until it lands). Same full-scan-then-filter shape
	// as ChatSessionsScreen — the collection is small.
	const collections = useCollections();
	const { data: sessionRows } = useLiveQuery(
		(q) => q.from({ chatSessions: collections.chatSessions }),
		[collections],
	);
	const sessionTitle =
		sessionRows?.find((s) => s.id === sessionId)?.title ?? "Chat";

	// The [sessionId] header is transparent (glass) so content is full-bleed
	// (top y=0). Because KeyboardAvoidingView measures its frame relative to its
	// parent (now the full-screen content view) while the keyboard frame is
	// window-absolute, the two share the same origin and the offset is 0. We
	// still use the header height to inset the message list below the glass bar.
	const headerHeight = useHeaderHeight();
	const hasBanner = !chat.hostOnline || Boolean(chat.error);

	// Resolving the workspace row from synced data (cache-first): only a spinner
	// when we truly have nothing yet.
	if (chat.workspaceResolving) {
		return (
			<View className="bg-background flex-1 items-center justify-center">
				<ActivityIndicator />
			</View>
		);
	}

	if (!chat.hostId || !chat.organizationId) {
		return (
			<View className="bg-background flex-1">
				<ConversationEmptyState
					title="Workspace unavailable"
					description="This workspace hasn't finished syncing yet."
				/>
			</View>
		);
	}

	const hasMessages = chat.messages.length > 0 || chat.currentMessage != null;

	return (
		<KeyboardAvoidingView
			className="bg-background flex-1"
			behavior={Platform.OS === "ios" ? "padding" : undefined}
			keyboardVerticalOffset={0}
		>
			<Stack.Screen
				options={{
					headerTitle: () => <GlassHeaderTitle title={sessionTitle} />,
				}}
			/>

			{hasBanner ? (
				// Banners sit below the transparent header (the message list scrolls
				// under it, but these status strips shouldn't be obscured by the glass).
				<View style={{ marginTop: headerHeight }}>
					{!chat.hostOnline ? (
						<View className="bg-muted px-3 py-2">
							<Text className="text-muted-foreground text-center text-xs">
								Host offline — open Superset on your Mac to reach this session.
							</Text>
						</View>
					) : null}

					{chat.error ? (
						<View className="bg-destructive/10 px-3 py-2">
							<Text className="text-destructive select-text text-center text-xs">
								{chat.error}
							</Text>
						</View>
					) : null}
				</View>
			) : null}

			<View className="flex-1">
				{chat.isConversationLoading && !hasMessages ? (
					<View className="flex-1 items-center justify-center">
						<ActivityIndicator />
					</View>
				) : hasMessages ? (
					<ChatMessageList
						messages={chat.messages as ChatMessage[]}
						currentMessage={chat.currentMessage as ChatMessage | null}
						isRunning={chat.isRunning}
						topInset={hasBanner ? 0 : headerHeight}
					/>
				) : (
					<ConversationEmptyState
						title="No messages yet"
						description="Send a message to start the conversation."
					/>
				)}
			</View>

			<ChatPendingActions
				pendingApproval={chat.pendingApproval}
				pendingQuestion={chat.pendingQuestion}
				pendingPlanApproval={chat.pendingPlanApproval}
				respondToApproval={chat.respondToApproval}
				respondToQuestion={chat.respondToQuestion}
				respondToPlan={chat.respondToPlan}
			/>

			<ChatComposer disabled={!chat.hostOnline} onSend={chat.sendMessage} />
		</KeyboardAvoidingView>
	);
}
