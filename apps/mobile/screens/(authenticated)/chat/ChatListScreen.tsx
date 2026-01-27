import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { MessageSquare, Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useSession } from "@/lib/auth/client";
import { env } from "@/lib/env";
import {
	createSession,
	listSessions,
	type SessionInfo,
} from "@/lib/streams/client";

export function ChatListScreen() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: authSession } = useSession();

	const [showNewChat, setShowNewChat] = useState(false);
	const [newChatTitle, setNewChatTitle] = useState("");
	const [isCreating, setIsCreating] = useState(false);

	const streamsUrl = env.EXPO_PUBLIC_STREAMS_URL;

	const {
		data: sessions = [],
		isLoading,
		refetch,
		isRefetching,
	} = useQuery({
		queryKey: ["sessions"],
		queryFn: listSessions,
		enabled: !!streamsUrl,
	});

	const handleCreateSession = useCallback(async () => {
		if (!newChatTitle.trim()) {
			Alert.alert("Error", "Please enter a chat title");
			return;
		}

		setIsCreating(true);
		try {
			const session = await createSession({
				title: newChatTitle.trim(),
				createdBy: authSession?.user?.id,
			});

			setNewChatTitle("");
			setShowNewChat(false);
			queryClient.invalidateQueries({ queryKey: ["sessions"] });

			// Navigate to the new chat
			router.push({
				pathname: "/(authenticated)/chat/[sessionId]",
				params: { sessionId: session.sessionId, title: session.title },
			});
		} catch (err) {
			console.error("[chat-list] Failed to create session:", err);
			Alert.alert("Error", "Failed to create chat session");
		} finally {
			setIsCreating(false);
		}
	}, [newChatTitle, authSession?.user?.id, queryClient, router]);

	const handleSelectSession = useCallback(
		(session: SessionInfo) => {
			router.push({
				pathname: "/(authenticated)/chat/[sessionId]",
				params: { sessionId: session.sessionId, title: session.title },
			});
		},
		[router],
	);

	const renderSession = useCallback(
		({ item }: { item: SessionInfo }) => (
			<Pressable onPress={() => handleSelectSession(item)}>
				<Card className="mx-4 mb-3">
					<CardContent className="flex-row items-center py-4">
						<View className="w-10 h-10 rounded-full bg-muted items-center justify-center mr-3">
							<MessageSquare size={20} color="#6b7280" />
						</View>
						<View className="flex-1">
							<Text className="font-medium">{item.title}</Text>
							<Text className="text-sm text-muted-foreground">
								{formatDate(item.createdAt)}
							</Text>
						</View>
					</CardContent>
				</Card>
			</Pressable>
		),
		[handleSelectSession],
	);

	const keyExtractor = useCallback((item: SessionInfo) => item.sessionId, []);

	if (!streamsUrl) {
		return (
			<>
				<Stack.Screen
					options={{
						title: "Chat",
						headerShown: true,
					}}
				/>
				<View className="flex-1 bg-background items-center justify-center p-4">
					<Text className="text-destructive text-center">
						EXPO_PUBLIC_STREAMS_URL is not configured
					</Text>
				</View>
			</>
		);
	}

	return (
		<>
			<Stack.Screen
				options={{
					title: "Chat",
					headerShown: true,
					headerRight: () => (
						<Pressable
							onPress={() => setShowNewChat(true)}
							className="mr-4 p-2"
						>
							<Plus size={24} color="#6b7280" />
						</Pressable>
					),
				}}
			/>
			<View className="flex-1 bg-background">
				{showNewChat && (
					<View className="p-4 border-b border-border bg-card">
						<Text className="font-medium mb-2">New Chat</Text>
						<Input
							placeholder="Enter chat title..."
							value={newChatTitle}
							onChangeText={setNewChatTitle}
							autoFocus
						/>
						<View className="flex-row gap-2 mt-3">
							<Button
								variant="outline"
								className="flex-1"
								onPress={() => {
									setShowNewChat(false);
									setNewChatTitle("");
								}}
								disabled={isCreating}
							>
								<Text>Cancel</Text>
							</Button>
							<Button
								className="flex-1"
								onPress={handleCreateSession}
								disabled={isCreating || !newChatTitle.trim()}
							>
								<Text>{isCreating ? "Creating..." : "Create"}</Text>
							</Button>
						</View>
					</View>
				)}

				<FlatList
					className="flex-1"
					data={sessions}
					renderItem={renderSession}
					keyExtractor={keyExtractor}
					contentContainerStyle={{ paddingTop: 16 }}
					refreshControl={
						<RefreshControl refreshing={isRefetching} onRefresh={refetch} />
					}
					ListEmptyComponent={
						<View className="flex-1 items-center justify-center py-20">
							{isLoading ? (
								<Text className="text-muted-foreground">Loading chats...</Text>
							) : (
								<View className="items-center">
									<MessageSquare size={48} color="#9ca3af" />
									<Text className="text-muted-foreground mt-4">
										No chats yet
									</Text>
									<Button className="mt-4" onPress={() => setShowNewChat(true)}>
										<Text>Start a Chat</Text>
									</Button>
								</View>
							)}
						</View>
					}
				/>
			</View>
		</>
	);
}

function formatDate(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diff = now.getTime() - date.getTime();

	// Less than 24 hours
	if (diff < 24 * 60 * 60 * 1000) {
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}

	// Less than 7 days
	if (diff < 7 * 24 * 60 * 60 * 1000) {
		return date.toLocaleDateString([], { weekday: "short" });
	}

	return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
