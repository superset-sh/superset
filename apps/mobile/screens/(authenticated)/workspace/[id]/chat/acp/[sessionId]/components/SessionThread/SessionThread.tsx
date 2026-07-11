import {
	useAcpPermissions,
	useAcpSession,
} from "@superset/session-protocol/react";
import { Stack } from "expo-router";
// Imported from expo-router's vendored copy on purpose: this reads the SAME
// HeaderHeightContext that expo-router's Stack populates. Declaring
// `@react-navigation/elements` as our own dep would pull a second copy with a
// different context instance and always return 0.
import { useHeaderHeight } from "expo-router/build/react-navigation/elements/Header/useHeaderHeight";
import { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	View,
} from "react-native";
import {
	Conversation,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Text } from "@/components/ui/text";
import { createAcpSessionsApi, createAcpStreamUrl } from "@/lib/host/client";
import { GlassHeaderTitle } from "@/screens/(authenticated)/workspace/[id]/chat/components/GlassHeaderTitle";
import { Composer } from "./components/Composer";
import { PermissionStack } from "./components/PermissionStack";
import { TimelineItemView } from "./components/TimelineItemView";

export function SessionThread({
	routingKey,
	sessionId,
}: {
	routingKey: string;
	sessionId: string;
}) {
	const api = useMemo(() => createAcpSessionsApi(routingKey), [routingKey]);
	const streamUrl = useMemo(
		() => createAcpStreamUrl({ routingKey, sessionId }),
		[routingKey, sessionId],
	);
	const session = useAcpSession({ sessionId, api, streamUrl });
	const permissions = useAcpPermissions(session);
	const [actionError, setActionError] = useState<string | null>(null);

	const status = session.state?.status;
	const composerStatus =
		status === "running" || status === "awaiting_permission"
			? ("streaming" as const)
			: ("ready" as const);

	const handleSend = useCallback(
		(text: string) => {
			setActionError(null);
			session.actions.prompt([{ type: "text", text }]).catch((cause) => {
				setActionError(cause instanceof Error ? cause.message : String(cause));
			});
		},
		[session.actions],
	);

	const handleStop = useCallback(() => {
		session.actions.cancel().catch((cause) => {
			setActionError(cause instanceof Error ? cause.message : String(cause));
		});
	}, [session.actions]);

	const handleSetMode = useCallback(
		(modeId: string) => {
			setActionError(null);
			session.actions.setMode(modeId).catch((cause) => {
				setActionError(cause instanceof Error ? cause.message : String(cause));
			});
		},
		[session.actions],
	);

	const handleSetConfigOption = useCallback(
		(configId: string, value: string) => {
			setActionError(null);
			session.actions.setConfigOption(configId, value).catch((cause) => {
				setActionError(cause instanceof Error ? cause.message : String(cause));
			});
		},
		[session.actions],
	);

	const isDead = status === "dead";
	// lastError is cleared host-side when a new prompt starts, so anything
	// here is about the current/most recent turn, not a stale failure.
	const stateError = session.state?.lastError ?? null;
	const errorText = actionError ?? session.error?.message ?? stateError;

	// Same glass-header geometry as the mastra ChatThreadScreen: the header is
	// transparent so content is full-bleed (offset 0) and the list scrolls under
	// the blurred bar, inset by the header height.
	const headerHeight = useHeaderHeight();
	const reconnecting = session.streamStatus === "reconnecting" && !isDead;
	const hasBanner = reconnecting || isDead || Boolean(errorText);

	// The adapter pushes the Claude-generated session title via
	// session_info_update; the host parks it on session-scoped state (survives
	// resyncs that only fetch the newest page) with the folded meta as backup.
	const title = session.state?.title ?? session.timeline.meta.title;

	return (
		<KeyboardAvoidingView
			className="bg-background flex-1"
			behavior={Platform.OS === "ios" ? "padding" : undefined}
			keyboardVerticalOffset={0}
		>
			<Stack.Screen
				options={{ headerTitle: () => <GlassHeaderTitle title={title} /> }}
			/>
			{hasBanner ? (
				// Banners sit below the transparent header (the list scrolls under
				// it, but these status strips shouldn't be obscured by the glass).
				<View style={{ marginTop: headerHeight }}>
					{reconnecting ? (
						<View className="bg-muted px-3 py-2">
							<Text className="text-muted-foreground text-center text-xs">
								Reconnecting to stream…
							</Text>
						</View>
					) : null}
					{isDead ? (
						<View className="bg-muted px-3 py-2">
							<Text className="text-muted-foreground text-center text-xs">
								Session ended — history is read-only.
							</Text>
						</View>
					) : null}
					{errorText ? (
						<View className="bg-destructive/10 px-3 py-2">
							<Text className="text-destructive select-text text-center text-xs">
								{errorText}
							</Text>
						</View>
					) : null}
				</View>
			) : null}
			<Conversation
				data={session.timeline.items}
				keyExtractor={(item) => item.id}
				contentContainerClassName="px-4 pb-4 gap-3"
				contentContainerStyle={{
					paddingTop: (hasBanner ? 0 : headerHeight) + 16,
				}}
				// Backward pagination: scrolling near the top pulls the next older
				// journal page; maintainVisibleContentPosition keeps the viewport
				// anchored while the page is prepended.
				maintainVisibleContentPosition
				onStartReached={session.hasOlder ? session.loadOlder : undefined}
				ListHeaderComponent={
					session.isLoadingOlder ? OlderPageIndicator : undefined
				}
				// Same running chip as the mastra ChatMessageList; the permission
				// card already signals awaiting_permission, so only "running" shows it.
				ListFooterComponent={
					status === "running" ? WorkingIndicator : undefined
				}
				renderItem={({ item }) => (
					<TimelineItemView item={item} onRespond={permissions.respond} />
				)}
			>
				{session.timeline.items.length === 0 ? (
					<ConversationEmptyState
						title={session.isLoading ? "Connecting…" : "No messages yet"}
						description={
							session.isLoading
								? undefined
								: "Send a prompt to start the agent."
						}
					/>
				) : null}
				<ConversationScrollButton />
			</Conversation>
			{/* Blocking asks stack above the composer (a request buried in the
			    timeline — inside a closed tool sheet or scrolled away — would
			    deadlock the turn). Answered cards dismiss; the resolution stays
			    on the tool call's record in its detail sheet. */}
			<PermissionStack
				pending={permissions.pending}
				onRespond={permissions.respond}
			/>
			{/* Dead sessions are read-only transcripts (the banner above says so);
			    a live composer would only offer prompts that can never be
			    delivered. */}
			{isDead ? null : (
				<Composer
					configOptions={session.state?.configOptions ?? []}
					currentMode={session.state?.currentMode ?? null}
					onSend={handleSend}
					onSetConfigOption={handleSetConfigOption}
					onSetMode={handleSetMode}
					onStop={handleStop}
					status={composerStatus}
				/>
			)}
		</KeyboardAvoidingView>
	);
}

function OlderPageIndicator() {
	return (
		<View className="items-center py-2">
			<ActivityIndicator size="small" />
		</View>
	);
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
