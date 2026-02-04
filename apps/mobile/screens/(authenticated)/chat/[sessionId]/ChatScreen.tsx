import { type MessageRow, useChatSession } from "@superset/ai-chat/stream";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import {
	ActivityIndicator,
	FlatList,
	KeyboardAvoidingView,
	Platform,
	View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { useSession } from "@/lib/auth/client";
import { env } from "@/lib/env";
import { generateUUID } from "@/lib/streams/client";
import { ChatInput } from "./components/ChatInput";
import { ChatMessage } from "./components/ChatMessage";
import { PresenceBar } from "./components/PresenceBar";

/**
 * Send a message to the durable stream.
 * Local implementation that uses generateUUID instead of crypto.randomUUID
 * which isn't available in React Native.
 */
async function sendMessageToStream({
	proxyUrl,
	sessionId,
	userId,
	content,
}: {
	proxyUrl: string;
	sessionId: string;
	userId: string;
	content: string;
}): Promise<void> {
	const uuid = generateUUID();

	const events = [
		{
			type: "chunk",
			key: uuid,
			value: {
				type: "user_input",
				content,
				actorId: userId,
				createdAt: new Date().toISOString(),
			},
			headers: { operation: "insert" },
		},
	];

	const response = await fetch(`${proxyUrl}/streams/${sessionId}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(events),
	});

	if (!response.ok) {
		throw new Error(`Failed to send message: ${response.status}`);
	}
}

export function ChatScreen() {
	const params = useLocalSearchParams<{ sessionId: string; title?: string }>();
	const { sessionId, title } = params;

	const { data: authSession } = useSession();
	const user = authSession?.user
		? { userId: authSession.user.id, name: authSession.user.name ?? "Unknown" }
		: null;

	const flatListRef = useRef<FlatList<MessageRow>>(null);

	const streamsUrl = env.EXPO_PUBLIC_STREAMS_URL;

	const {
		messages,
		streamingMessage,
		users,
		draft,
		setDraft,
		isLoading,
		connectionStatus,
		error,
	} = useChatSession({
		proxyUrl: streamsUrl ?? "",
		sessionId: sessionId ?? "",
		user,
		autoConnect: !!user && !!streamsUrl && !!sessionId,
	});

	// Scroll to bottom when new messages arrive
	useEffect(() => {
		if (messages.length > 0 || streamingMessage) {
			setTimeout(() => {
				flatListRef.current?.scrollToEnd({ animated: true });
			}, 100);
		}
	}, [messages.length, streamingMessage?.content, streamingMessage]);

	const handleSend = useCallback(
		async (content: string) => {
			if (!user?.userId || !streamsUrl || !sessionId) {
				console.error(
					"[chat] Cannot send message: missing user, URL, or sessionId",
				);
				return;
			}
			try {
				await sendMessageToStream({
					proxyUrl: streamsUrl,
					sessionId,
					userId: user.userId,
					content,
				});
			} catch (err) {
				console.error("[chat] Failed to send message:", err);
			}
		},
		[user?.userId, sessionId],
	);

	const allMessages = streamingMessage
		? [...messages, streamingMessage]
		: messages;

	const renderMessage = useCallback(
		({ item }: { item: MessageRow }) => (
			<ChatMessage
				message={item}
				isCurrentUser={item.actorId === user?.userId}
			/>
		),
		[user?.userId],
	);

	const keyExtractor = useCallback((item: MessageRow) => item.id, []);

	if (!sessionId) {
		return (
			<View className="flex-1 bg-background items-center justify-center">
				<Text className="text-muted-foreground">No session selected</Text>
			</View>
		);
	}

	if (!streamsUrl) {
		return (
			<View className="flex-1 bg-background items-center justify-center p-4">
				<Text className="text-destructive text-center">
					EXPO_PUBLIC_STREAMS_URL is not configured
				</Text>
			</View>
		);
	}

	return (
		<>
			<Stack.Screen
				options={{
					title: title ?? "Chat",
					headerShown: true,
				}}
			/>
			<KeyboardAvoidingView
				className="flex-1 bg-background"
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
			>
				<PresenceBar users={users} currentUserId={user?.userId} />

				{connectionStatus === "connecting" && (
					<View className="flex-row items-center justify-center py-2 bg-muted/50">
						<ActivityIndicator size="small" className="mr-2" />
						<Text className="text-sm text-muted-foreground">Connecting...</Text>
					</View>
				)}

				{error && (
					<View className="px-4 py-2 bg-destructive/10">
						<Text className="text-sm text-destructive">
							Error: {error.message}
						</Text>
					</View>
				)}

				<FlatList
					ref={flatListRef}
					className="flex-1"
					data={allMessages}
					renderItem={renderMessage}
					keyExtractor={keyExtractor}
					contentContainerStyle={{ paddingVertical: 16 }}
					ListEmptyComponent={
						<View className="flex-1 items-center justify-center py-20">
							<Text className="text-muted-foreground">
								{isLoading ? "Loading messages..." : "No messages yet"}
							</Text>
						</View>
					}
				/>

				<ChatInput
					value={draft}
					onChange={setDraft}
					onSend={handleSend}
					disabled={connectionStatus !== "connected"}
				/>
			</KeyboardAvoidingView>
		</>
	);
}
