import { Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/build/react-navigation/elements/Header/useHeaderHeight";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	View,
} from "react-native";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { PendingActions } from "./components/PendingActions";
import { SessionComposer } from "./components/SessionComposer";
import { SessionTimeline } from "./components/SessionTimeline";
import { useClaudeSessionThread } from "./hooks/useClaudeSessionThread";

export function ClaudeSessionThreadScreen() {
	const { id, sessionId } = useLocalSearchParams<{
		id: string;
		sessionId: string;
	}>();
	const session = useClaudeSessionThread({ workspaceId: id, sessionId });
	const headerHeight = useHeaderHeight();
	const reconnecting = session.streamStatus === "reconnecting";
	const terminalError = session.state?.lastError;
	const hasBanner =
		!session.hostOnline ||
		reconnecting ||
		Boolean(session.error) ||
		Boolean(terminalError);

	if (session.workspaceResolving) {
		return (
			<View className="bg-background flex-1 items-center justify-center">
				<ActivityIndicator />
			</View>
		);
	}

	if (!session.hostId || !session.organizationId) {
		return (
			<View className="bg-background flex-1">
				<ConversationEmptyState
					description="This workspace has not finished syncing to a host."
					title="Workspace unavailable"
				/>
			</View>
		);
	}

	const status = session.state?.status;
	const isRunning = status === "running";
	const composerStatus =
		status === "running" || status === "requires_action"
			? ("streaming" as const)
			: ("ready" as const);
	const composerDisabled =
		!session.hostOnline ||
		!session.isSynchronized ||
		!session.state ||
		status === "starting" ||
		status === "exited" ||
		status === "errored";

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : undefined}
			className="bg-background flex-1"
			keyboardVerticalOffset={0}
			testID="claude-session-screen"
		>
			<Stack.Screen options={{ title: session.state?.model ?? "Claude" }} />
			{hasBanner ? (
				<View style={{ marginTop: headerHeight }}>
					{!session.hostOnline ? (
						<View className="bg-muted px-3 py-2">
							<Text className="text-muted-foreground text-center text-xs">
								Host offline — open Superset on your Mac to reconnect.
							</Text>
						</View>
					) : null}
					{reconnecting ? (
						<View className="bg-muted px-3 py-2">
							<Text className="text-muted-foreground text-center text-xs">
								Reconnecting to the SDK stream…
							</Text>
						</View>
					) : null}
					{session.error ? (
						<View className="bg-destructive/10 px-3 py-2">
							<Text className="text-destructive select-text text-center text-xs">
								{session.error}
							</Text>
						</View>
					) : null}
					{terminalError ? (
						<View
							className="bg-destructive/10 items-center gap-2 px-3 py-2"
							testID="claude-session-terminal-error"
						>
							<Text className="text-destructive select-text text-center text-xs">
								{terminalError}
							</Text>
							{session.state?.status === "errored" && session.hostOnline ? (
								<Button
									disabled={!session.isSynchronized || session.isRetrying}
									onPress={() => void session.retry()}
									size="sm"
									testID="claude-session-retry"
									variant="outline"
								>
									<Text>
										{session.isRetrying ? "Retrying…" : "Retry session"}
									</Text>
								</Button>
							) : null}
						</View>
					) : null}
				</View>
			) : null}

			<SessionTimeline
				isLoading={session.isLoading}
				isRunning={isRunning}
				timeline={session.timeline}
				topInset={hasBanner ? 0 : headerHeight}
			/>
			<PendingActions
				disabled={!session.isSynchronized}
				elicitations={session.state?.pendingElicitations ?? []}
				onElicitation={session.respondToElicitation}
				onPermission={session.respondToPermission}
				onQuestion={session.respondToQuestion}
				onUserDialog={session.respondToUserDialog}
				permissions={session.state?.pendingPermissions ?? []}
				userDialogs={session.state?.pendingUserDialogs ?? []}
			/>
			<SessionComposer
				catalog={session.catalog}
				disabled={composerDisabled}
				isSending={session.isSending}
				onSend={session.sendMessage}
				onSetModel={(model) => void session.setModel(model)}
				onSetPermissionMode={(mode) => void session.setPermissionMode(mode)}
				onStop={() => void session.interrupt()}
				state={session.state}
				status={composerStatus}
			/>
		</KeyboardAvoidingView>
	);
}
