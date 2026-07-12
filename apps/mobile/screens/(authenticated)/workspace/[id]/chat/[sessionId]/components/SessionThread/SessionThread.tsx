import {
	SessionsSyncProvider,
	useRetainSession,
	useSession,
	useSessionStream,
	useSessionsSyncClient,
	useSessionTimeline,
} from "@superset/host-service-react";
import type {
	PermissionOutcome,
	SettingOption,
} from "@superset/host-service-sync/protocol";
import { Stack } from "expo-router";
// Imported from expo-router's vendored copy on purpose: this reads the SAME
// HeaderHeightContext that expo-router's Stack populates. Declaring
// `@react-navigation/elements` as our own dep would pull a second copy with a
// different context instance and always return 0.
import { useHeaderHeight } from "expo-router/build/react-navigation/elements/Header/useHeaderHeight";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	View,
} from "react-native";
import {
	Conversation,
	type ConversationController,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Text } from "@/components/ui/text";
import {
	cancelTurn,
	getHostSyncClient,
	resolvePermission,
	submitTurn,
	updateSession,
} from "@/lib/host/client";
import { GlassHeaderTitle } from "@/screens/(authenticated)/workspace/[id]/chat/components/GlassHeaderTitle";
import { Composer } from "./components/Composer";
import { PermissionStack } from "./components/PermissionStack";
import { TimelineItemView } from "./components/TimelineItemView";
import { TypingIndicator } from "./components/TypingIndicator";
import { getSessionThreadPresentation } from "./utils/getSessionThreadPresentation";

export function SessionThread({
	routingKey,
	sessionId,
}: {
	routingKey: string;
	sessionId: string;
}) {
	const client = useMemo(() => getHostSyncClient(routingKey), [routingKey]);
	return (
		<SessionsSyncProvider client={client}>
			<SessionThreadBody routingKey={routingKey} sessionId={sessionId} />
		</SessionsSyncProvider>
	);
}

function SessionThreadBody({
	routingKey,
	sessionId,
}: {
	routingKey: string;
	sessionId: string;
}) {
	const client = useSessionsSyncClient();
	useRetainSession(sessionId, "focused");
	const session = useSession(sessionId);
	const stream = useSessionStream(sessionId);
	const timeline = useSessionTimeline(sessionId);
	const [actionError, setActionError] = useState<string | null>(null);
	const [isLoadingOlder, setIsLoadingOlder] = useState(false);
	const conversationRef = useRef<ConversationController>(null);
	// Set on send; consumed when the echoed user message lands in the
	// timeline, anchoring it to the top ChatGPT-style.
	const pendingAnchorRef = useRef(false);

	const runState = session?.runState;
	const mainThreadId = session?.mainThreadId ?? null;
	const activeTurnId = timeline.activeTurnId;

	const handleSend = useCallback(
		(text: string) => {
			if (mainThreadId === null) return;
			setActionError(null);
			// The reply takes a while — drop the keyboard so the user can watch
			// it stream in, and anchor their message to the top once it echoes.
			Keyboard.dismiss();
			pendingAnchorRef.current = true;
			submitTurn(routingKey, {
				sessionId,
				threadId: mainThreadId,
				content: [{ type: "text", text }],
			}).catch((cause) => {
				pendingAnchorRef.current = false;
				setActionError(cause instanceof Error ? cause.message : String(cause));
			});
		},
		[routingKey, sessionId, mainThreadId],
	);

	const handleStop = useCallback(() => {
		if (activeTurnId === null) return;
		cancelTurn(routingKey, { sessionId, turnId: activeTurnId }).catch(
			(cause) => {
				setActionError(cause instanceof Error ? cause.message : String(cause));
			},
		);
	}, [routingKey, sessionId, activeTurnId]);

	const handleRespond = useCallback(
		async (permissionId: string, outcome: PermissionOutcome) => {
			setActionError(null);
			await resolvePermission(routingKey, { sessionId, permissionId, outcome });
		},
		[routingKey, sessionId],
	);

	const handleSetSetting = useCallback(
		(option: SettingOption, value: string) => {
			// The chips are limited to catalogs updateSession's settings surface
			// covers (see PICKABLE_KINDS in the Composer).
			const field =
				option.kind === "model"
					? "activeModel"
					: option.kind === "mode"
						? "activeMode"
						: option.kind === "effort"
							? "effort"
							: null;
			if (field === null) return;
			setActionError(null);
			updateSession(routingKey, {
				sessionId,
				settings: { [field]: value },
			}).catch((cause) => {
				setActionError(cause instanceof Error ? cause.message : String(cause));
			});
		},
		[routingKey, sessionId],
	);

	const loadOlder = useCallback(() => {
		setIsLoadingOlder(true);
		client
			.fetchOlderEvents(sessionId)
			.catch(() => {
				// Scrollback failures are retried by scrolling again; no banner.
			})
			.finally(() => setIsLoadingOlder(false));
	}, [client, sessionId]);

	const isLoading =
		stream === null ||
		((stream.status === "idle" ||
			stream.status === "subscribing" ||
			stream.status === "replaying") &&
			stream.eventIds.length === 0);

	// Session.error is host state (cleared when a new turn starts); the fold's
	// lastError covers turn failures the entity no longer reflects.
	const stateError = session?.error?.code ?? timeline.lastError;
	const errorText = actionError ?? stream?.error?.code ?? stateError;
	const {
		bannerError,
		canCompose,
		composerStatus,
		emptyDescription,
		emptyTitle,
		isDead,
		reconnecting,
	} = getSessionThreadPresentation({
		runState,
		streamStatus: stream?.status,
		isLoading,
		errorText,
	});

	// The just-sent user message, for the ChatGPT-style top anchor.
	const lastUserIndex = useMemo(() => {
		for (let index = timeline.items.length - 1; index >= 0; index -= 1) {
			const item = timeline.items[index];
			if (item.kind === "message" && item.role === "user") return index;
		}
		return -1;
	}, [timeline.items]);
	const lastUserMessageId =
		lastUserIndex >= 0 ? timeline.items[lastUserIndex]?.id : null;
	const lastUserIndexRef = useRef(lastUserIndex);
	lastUserIndexRef.current = lastUserIndex;

	useEffect(() => {
		if (!pendingAnchorRef.current) return;
		if (lastUserMessageId === null) return;
		pendingAnchorRef.current = false;
		conversationRef.current?.scrollToAnchor(lastUserIndexRef.current);
	}, [lastUserMessageId]);

	// Glass-header geometry: the header is
	// transparent so content is full-bleed (offset 0) and the list scrolls under
	// the blurred bar, inset by the header height.
	const headerHeight = useHeaderHeight();
	const hasBanner = reconnecting || isDead || Boolean(bannerError);

	const title = session?.title ?? null;

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
					{bannerError ? (
						<View className="bg-destructive/10 px-3 py-2">
							<Text className="text-destructive select-text text-center text-xs">
								{bannerError}
							</Text>
						</View>
					) : null}
				</View>
			) : null}
			{isLoading ? (
				// The last page loads as ONE snapshot (the host resurrects on
				// read) — hold the spinner until it lands so Conversation mounts
				// with the full page and its first-paint veil reveals it parked
				// at the bottom. Never mount on a partial stream.
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator />
				</View>
			) : (
				<Conversation
					data={timeline.items}
					keyExtractor={(item) => item.id}
					anchorOffsetTop={headerHeight + 8}
					contentPaddingBottom={16}
					controllerRef={conversationRef}
					contentContainerClassName="px-4 pb-4 gap-3"
					contentContainerStyle={{
						paddingTop: (hasBanner ? 0 : headerHeight) + 16,
					}}
					// Backward pagination: scrolling near the top pulls the next older
					// journal page; maintainVisibleContentPosition keeps the viewport
					// anchored while the page is prepended.
					maintainVisibleContentPosition
					onStartReached={stream?.hasOlder ? loadOlder : undefined}
					ListHeaderComponent={isLoadingOlder ? OlderPageIndicator : undefined}
					// The permission card already signals a blocking ask, so only
					// "running" shows the dots.
					ListFooterComponent={
						runState === "running" ? TypingIndicator : undefined
					}
					renderItem={({ item }) => (
						<TimelineItemView item={item} onRespond={handleRespond} />
					)}
				>
					{timeline.items.length === 0 ? (
						<ConversationEmptyState
							title={emptyTitle}
							description={emptyDescription}
						/>
					) : null}
					<ConversationScrollButton />
				</Conversation>
			)}
			{/* Blocking asks stack above the composer (a request buried in the
			    timeline — inside a closed tool sheet or scrolled away — would
			    deadlock the turn). Answered cards dismiss; the resolution stays
			    on the tool call's record in its detail sheet. */}
			<PermissionStack
				pending={timeline.pendingPermissions}
				onRespond={handleRespond}
			/>
			{/* Dead, offline, and not-yet-loaded sessions cannot accept prompts. In
			    particular, keep the composer hidden after a failed session/load so the
			    destructive banner is not paired with an action guaranteed to fail. */}
			{canCompose ? (
				<Composer
					onSend={handleSend}
					onStop={handleStop}
					onSetSetting={handleSetSetting}
					settingOptions={session?.settingOptions ?? []}
					status={composerStatus}
				/>
			) : null}
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
