import { Trans, useLingui } from "@lingui/react/macro";
import { deriveQueuedPrompts, displayText } from "@superset/chat/core";
import type { Decision } from "@superset/chat/protocol";
import { useChatSession, useTimeline } from "@superset/chat/react";
import { CircleStop } from "lucide-react-native";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
} from "react";
import { ActionSheetIOS, Alert, Pressable, View } from "react-native";
import { Conversation } from "@/components/ai-elements/conversation";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { type ChatHost, createChatSessionClient } from "@/lib/chat";
import { errorCopy } from "@/lib/errors";
import { ChatRowView } from "./components/ChatRowView";
import { QueuedPrompts } from "./components/QueuedPrompts";
import { type ChatRow, chatRows, runningTurnId } from "./utils/chatRows";

export interface ChatSessionViewHandle {
	send: (text: string) => Promise<void>;
}

interface ChatSessionViewProps {
	sessionId: string;
	host: ChatHost;
	hostUrl: string;
}

/**
 * A chat-v3 session in place of a terminal. The composer below the screen
 * sends through `send`; prompts typed while the agent works join the host's
 * queue, the same one desktop shows.
 */
export const ChatSessionView = forwardRef<
	ChatSessionViewHandle,
	ChatSessionViewProps
>(function ChatSessionView({ sessionId, host, hostUrl }, ref) {
	const { t } = useLingui();
	const { organizationId, machineId } = host;
	const client = useMemo(
		() =>
			createChatSessionClient({
				sessionId,
				host: { organizationId, machineId },
				hostUrl,
			}),
		[sessionId, organizationId, machineId, hostUrl],
	);
	useEffect(() => () => client.close(), [client]);

	const chat = useChatSession({ client });
	const groups = useTimeline(chat.snapshot);
	const rows = useMemo(
		() => chatRows(groups, chat.outbox),
		[groups, chat.outbox],
	);
	const queued = useMemo(
		() => deriveQueuedPrompts(chat.snapshot),
		[chat.snapshot],
	);
	const session = chat.snapshot.session;
	const harness = session?.harness;
	const turnId = runningTurnId(groups);

	useImperativeHandle(
		ref,
		() => ({
			send: async (text: string) => {
				if (!text.trim()) return;
				chat.sendPrompt([{ type: "text", text }]);
			},
		}),
		[chat],
	);

	const failAlert = useCallback(
		(title: string) => (cause: unknown) => Alert.alert(title, errorCopy(cause)),
		[],
	);

	const { respondToApproval } = chat;
	const onRespond = useCallback(
		(approvalId: string, decision: Decision) =>
			respondToApproval(approvalId, decision).catch(
				failAlert(t({ message: "Could not answer the agent" })),
			),
		[respondToApproval, failAlert, t],
	);

	const stop = useCallback(() => {
		if (!turnId) return;
		void chat
			.cancelTurn(turnId, { pauseQueue: true })
			.catch(failAlert(t({ message: "Could not stop the agent" })));
	}, [chat, turnId, failAlert, t]);

	const modes = session?.availableModes ?? [];
	const currentMode = modes.find((mode) => mode.id === session?.modeId);
	const pickMode = useCallback(() => {
		const cancel = t({ message: "Cancel" });
		ActionSheetIOS.showActionSheetWithOptions(
			{
				options: [...modes.map((mode) => mode.label), cancel],
				cancelButtonIndex: modes.length,
			},
			(index) => {
				const mode = modes[index];
				if (!mode) return;
				void chat
					.setMode(mode.id)
					.catch(failAlert(t({ message: "Could not change the mode" })));
			},
		);
	}, [modes, chat, failAlert, t]);

	const renderRow = useCallback(
		({ item: row }: { item: ChatRow }) => (
			<View className="pb-4">
				<ChatRowView
					harness={harness}
					onDiscardPrompt={chat.discardPrompt}
					onRespond={onRespond}
					onRetryPrompt={chat.retryPrompt}
					row={row}
					text={
						row.kind === "item" &&
						(row.item.kind === "agent_message" || row.item.kind === "reasoning")
							? displayText(chat.snapshot, row.item.id)
							: ""
					}
				/>
			</View>
		),
		[harness, chat, onRespond],
	);

	const banner =
		session?.status === "dead"
			? t({ message: "This chat has ended." })
			: chat.connection !== "open" && chat.status === "ready"
				? t({ message: "Reconnecting…" })
				: null;

	return (
		<View className="flex-1">
			{banner ? (
				<View className="bg-muted px-3 py-1.5">
					<Text className="text-muted-foreground text-center text-xs">
						{banner}
					</Text>
				</View>
			) : null}
			<Conversation
				contentContainerClassName="px-4 pt-4"
				data={rows}
				keyExtractor={(row) => row.key}
				ListHeaderComponent={
					chat.hasOlder ? (
						<Pressable
							accessibilityRole="button"
							className="items-center pb-4"
							onPress={() => void chat.loadOlder()}
						>
							<Text className="text-muted-foreground text-xs font-medium">
								<Trans>Load earlier messages</Trans>
							</Text>
						</Pressable>
					) : null
				}
				ListFooterComponent={
					<View className="gap-3 pb-4">
						<QueuedPrompts
							onRemove={(itemId) =>
								void chat
									.removeQueuedPrompt(itemId)
									.catch(failAlert(t({ message: "Could not delete" })))
							}
							onResume={() =>
								void chat
									.resumeQueue()
									.catch(failAlert(t({ message: "Could not resume" })))
							}
							onSteer={(itemId) =>
								void chat
									.steerQueuedPrompt(itemId)
									.catch(failAlert(t({ message: "Could not steer" })))
							}
							paused={session?.queuePaused === true}
							prompts={queued}
						/>
						<View className="flex-row items-center justify-between gap-3">
							{currentMode ? (
								<Pressable
									accessibilityRole="button"
									className="border-border rounded-full border px-3 py-1"
									onPress={pickMode}
								>
									<Text className="text-muted-foreground text-xs">
										{currentMode.label}
									</Text>
								</Pressable>
							) : (
								<View />
							)}
							{turnId ? (
								<Pressable
									accessibilityRole="button"
									className="border-border flex-row items-center gap-1.5 rounded-full border px-3 py-1"
									onPress={stop}
								>
									<Icon as={CircleStop} className="text-foreground size-3.5" />
									<Text className="text-foreground text-xs font-medium">
										<Trans>Stop</Trans>
									</Text>
								</Pressable>
							) : null}
						</View>
					</View>
				}
				renderItem={renderRow}
			/>
		</View>
	);
});
