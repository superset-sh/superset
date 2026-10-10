import { Trans, useLingui } from "@lingui/react/macro";
import {
	deriveQueuedPrompts,
	displayText,
	launchConfigSelections,
	runningTurnId,
} from "@superset/chat/core";
import type { Decision } from "@superset/chat/protocol";
import {
	ItemBodiesProvider,
	useChatSession,
	useTimeline,
} from "@superset/chat/react";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { GitPullRequest } from "lucide-react-native";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { ActionSheetIOS, Alert, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Conversation } from "@/components/ai-elements/conversation";
import { Text } from "@/components/ui/text";
import {
	type ChatHost,
	createChatSessionClient,
	getChatTransport,
} from "@/lib/chat";
import { errorCopy } from "@/lib/errors";
import { usePendingChatLaunchStore } from "@/screens/(authenticated)/stores/pendingChatLaunchStore";
import { useActiveChatStore } from "../../stores/activeChatStore";
import { useChatActivityStore } from "../../stores/chatActivityStore";
import {
	type ChatRow,
	chatRows,
	groupActivity,
	groupPositions,
	lastReplyKeys,
} from "../../utils/chatRows";
import { ChatRowView } from "../ChatRowView";
import { DockChip } from "./components/DockChip";
import { QueuedPrompts } from "./components/QueuedPrompts";
import { ScrollToBottom } from "./components/ScrollToBottom";
import { StickToBottom } from "./components/StickToBottom";

const CONFIG_OPTIONS_GRACE_MS = 1000;
const BANNER_SPACE = 36;

function activityTexts(
	activity: ChatRow[],
	snapshot: Parameters<typeof displayText>[0],
): Record<string, string> {
	return Object.fromEntries(
		activity.flatMap((row) =>
			row.kind === "item" &&
			(row.item.kind === "reasoning" || row.item.kind === "agent_message")
				? [[row.item.id, displayText(snapshot, row.item.id)]]
				: [],
		),
	);
}

export interface ChatAttachment {
	attachmentId: string;
	name: string;
	mimeType: string;
}

export interface ChatSessionViewHandle {
	send: (text: string, attachments?: ChatAttachment[]) => Promise<void>;
}

interface ChatSessionViewProps {
	sessionId: string;
	workspaceId: string;
	host: ChatHost;
	hostUrl: string;
	onOpenSession: (sessionId: string) => void;
	onTap?: () => void;
	pullRequestLabel?: string;
	onOpenPullRequests?: () => void;
}

/**
 * A chat-v3 session in place of a terminal. The composer below the screen
 * sends through `send`; prompts typed while the agent works join the host's
 * queue, the same one desktop shows.
 */
export const ChatSessionView = forwardRef<
	ChatSessionViewHandle,
	ChatSessionViewProps
>(function ChatSessionView(
	{
		sessionId,
		workspaceId,
		host,
		hostUrl,
		onOpenSession,
		onTap,
		pullRequestLabel,
		onOpenPullRequests,
	},
	ref,
) {
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
		() => groupActivity(chatRows(groups, chat.outbox)),
		[groups, chat.outbox],
	);
	const positions = useMemo(() => groupPositions(rows), [rows]);
	const replyEnds = useMemo(() => lastReplyKeys(rows), [rows]);
	const [dockHeight, setDockHeight] = useState(0);
	const queued = useMemo(
		() => deriveQueuedPrompts(chat.snapshot),
		[chat.snapshot],
	);
	const [queueOpen, setQueueOpen] = useState(false);
	const session = chat.snapshot.session;
	const queuePaused = session?.queuePaused === true;
	const harness = session?.harness;
	const turnId = runningTurnId(chat.snapshot.turns);

	const hasPendingLaunch = usePendingChatLaunchStore(
		(state) => sessionId in state.bySessionId,
	);
	const launchStarted = useRef(false);
	const configOptions = session?.configOptions;
	const agentStatus = session?.status;
	useEffect(() => {
		if (!hasPendingLaunch || launchStarted.current) return;
		if (chat.status !== "ready") return;
		const run = async (options: NonNullable<typeof configOptions>) => {
			launchStarted.current = true;
			const launch = usePendingChatLaunchStore.getState().take(sessionId);
			if (!launch) return;
			for (const selection of launchConfigSelections(options, launch)) {
				await chat
					.setConfigOption(selection.configId, selection.value)
					.catch(() => {});
			}
			if (launch.content.length > 0) chat.sendPrompt(launch.content);
		};
		if (configOptions) {
			void run(configOptions);
			return;
		}
		if (agentStatus !== "idle") return;
		const timer = setTimeout(() => void run([]), CONFIG_OPTIONS_GRACE_MS);
		return () => clearTimeout(timer);
	}, [hasPendingLaunch, chat, configOptions, agentStatus, sessionId]);

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

	const stopTask = useCallback(
		(taskId: string) => {
			const title = t({ message: "Could not stop the task" });
			void chat
				.stopBackgroundTask(taskId)
				.then((stopped) => {
					if (!stopped) Alert.alert(title);
				})
				.catch(failAlert(title));
		},
		[chat, failAlert, t],
	);

	const branchFrom = useCallback(
		(itemId: string) => {
			ActionSheetIOS.showActionSheetWithOptions(
				{
					options: [
						t({ message: "Branch from here" }),
						t({ message: "Cancel" }),
					],
					cancelButtonIndex: 1,
				},
				(index) => {
					if (index !== 0) return;
					const transport = getChatTransport(hostUrl);
					void transport
						.forkSession({
							commandId: randomUUID(),
							sessionId,
							workspaceId,
							fromItemId: itemId,
						})
						.then((forked) => {
							if (!forked) {
								Alert.alert(
									t({ message: "This agent can't branch a conversation" }),
								);
								return;
							}
							onOpenSession(forked.sessionId);
						})
						.catch(failAlert(t({ message: "Could not branch the chat" })));
				},
			);
		},
		[hostUrl, sessionId, workspaceId, onOpenSession, failAlert, t],
	);

	const availableModes = session?.availableModes;
	const modes = useMemo(() => availableModes ?? [], [availableModes]);
	const confirmedModeId = session?.modeId;
	const [pendingMode, setPendingMode] = useState<{
		modeId: string;
		from: string | undefined;
	}>();
	const pendingModeId =
		pendingMode && pendingMode.from === confirmedModeId
			? pendingMode.modeId
			: undefined;
	const selectMode = useCallback(
		(modeId: string) => {
			setPendingMode({ modeId, from: confirmedModeId });
			void chat.setMode(modeId).catch((cause: unknown) => {
				setPendingMode(undefined);
				failAlert(t({ message: "Could not change the mode" }))(cause);
			});
		},
		[chat, confirmedModeId, failAlert, t],
	);

	const backgroundTasks = session?.backgroundTasks;
	const actionsRef = useRef({ selectMode, stopTask, stop });
	actionsRef.current = { selectMode, stopTask, stop };
	useEffect(() => {
		useActiveChatStore.getState().publish(sessionId, {
			modes,
			currentModeId: pendingModeId ?? confirmedModeId,
			backgroundTasks: backgroundTasks ?? [],
			running: turnId !== null,
			selectMode: (modeId) => actionsRef.current.selectMode(modeId),
			stopTask: (taskId) => actionsRef.current.stopTask(taskId),
			stop: () => actionsRef.current.stop(),
		});
	}, [
		sessionId,
		modes,
		pendingModeId,
		confirmedModeId,
		backgroundTasks,
		turnId,
	]);
	useEffect(
		() => () => useActiveChatStore.getState().clear(sessionId),
		[sessionId],
	);

	useImperativeHandle(
		ref,
		() => ({
			send: async (text: string, attachments: ChatAttachment[] = []) => {
				if (!text.trim() && attachments.length === 0) return;
				chat.sendPrompt([
					...(text.trim() ? [{ type: "text" as const, text }] : []),
					...attachments.map((attachment) => ({
						type: "attachment" as const,
						...attachment,
					})),
				]);
			},
		}),
		[chat],
	);

	const router = useRouter();
	const headerHeight = useHeaderHeight();
	const latest = useRef({ rows, snapshot: chat.snapshot });
	latest.current = { rows, snapshot: chat.snapshot };
	const openActivity = useCallback(
		(key: string) => {
			const { rows: current, snapshot } = latest.current;
			const row = current.find((candidate) => candidate.key === key);
			if (row?.kind !== "activity") return;
			useChatActivityStore
				.getState()
				.open(key, row.rows, activityTexts(row.rows, snapshot));
			router.push(`/(authenticated)/workspace/${workspaceId}/activity`);
		},
		[router, workspaceId],
	);
	const openActivityKey = useChatActivityStore((state) => state.openKey);
	useEffect(() => {
		if (!openActivityKey) return;
		const row = rows.find((candidate) => candidate.key === openActivityKey);
		if (row?.kind !== "activity") return;
		useChatActivityStore
			.getState()
			.publish(row.rows, activityTexts(row.rows, chat.snapshot));
	}, [openActivityKey, rows, chat.snapshot]);

	const renderRow = useCallback(
		({ item: row, index }: { item: ChatRow; index: number }) => {
			const position = positions[index] ?? "single";
			const endsGroup = position === "single" || position === "last";
			return (
				<View className={endsGroup ? "pb-5" : "pb-2.5"}>
					<ChatRowView
						harness={harness}
						onDiscardPrompt={chat.discardPrompt}
						onLongPressMessage={branchFrom}
						onOpenActivity={openActivity}
						onRespond={onRespond}
						onRetryPrompt={chat.retryPrompt}
						isLastReply={replyEnds.has(row.key)}
						row={row}
						text={
							row.kind === "item" &&
							(row.item.kind === "agent_message" ||
								row.item.kind === "reasoning")
								? displayText(chat.snapshot, row.item.id)
								: ""
						}
					/>
				</View>
			);
		},
		[harness, chat, onRespond, branchFrom, positions, replyEnds, openActivity],
	);

	const onTapRef = useRef(onTap);
	onTapRef.current = onTap;
	const tap = useMemo(
		() =>
			Gesture.Tap()
				.runOnJS(true)
				.cancelsTouchesInView(false)
				.onEnd((_event, success) => {
					if (success) onTapRef.current?.();
				}),
		[],
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
				<View
					className="bg-secondary absolute z-10 self-center rounded-full px-3.5 py-1.5"
					style={{ top: headerHeight + 8 }}
				>
					<Text className="text-foreground text-xs font-medium">{banner}</Text>
				</View>
			) : null}
			<ItemBodiesProvider requestItemBodies={chat.requestItemBodies}>
				<GestureDetector gesture={tap}>
					<View className="flex-1">
						<Conversation
							contentContainerClassName="px-4"
							contentContainerStyle={{
								paddingTop: headerHeight + 16 + (banner ? BANNER_SPACE : 0),
							}}
							data={rows}
							keyExtractor={(row) => row.key}
							ListHeaderComponent={
								chat.hasOlder ? (
									<Pressable
										accessibilityRole="button"
										className="bg-secondary mb-4 self-center rounded-full px-3.5 py-1.5 active:opacity-70"
										onPress={() => void chat.loadOlder()}
									>
										<Text className="text-foreground text-xs font-medium">
											<Trans>Load earlier messages</Trans>
										</Text>
									</Pressable>
								) : null
							}
							ListFooterComponent={<View style={{ height: dockHeight + 8 }} />}
							renderItem={renderRow}
						>
							<StickToBottom inset={dockHeight} />
							<ScrollToBottom inset={dockHeight} />
						</Conversation>
					</View>
				</GestureDetector>
			</ItemBodiesProvider>
			<View
				className="absolute inset-x-0 bottom-0 gap-2 px-3 pb-2"
				onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
				pointerEvents="box-none"
			>
				{queueOpen && queued.length > 0 ? (
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
						paused={queuePaused}
						prompts={queued}
					/>
				) : null}
				{pullRequestLabel || queued.length > 0 ? (
					<View className="flex-row gap-2" pointerEvents="box-none">
						{pullRequestLabel && onOpenPullRequests ? (
							<DockChip
								icon={GitPullRequest}
								label={pullRequestLabel}
								onPress={onOpenPullRequests}
							/>
						) : null}
						{queued.length > 0 ? (
							<DockChip
								count={queued.length}
								label={
									queuePaused
										? t({ message: "Queue paused" })
										: t({ message: "Queued" })
								}
								onPress={() => setQueueOpen((open) => !open)}
								selected={queueOpen}
							/>
						) : null}
					</View>
				) : null}
			</View>
		</View>
	);
});
