import { Trans } from "@lingui/react/macro";
import type { SessionClient } from "@superset/chat/client";
import { deriveQueuedPrompts } from "@superset/chat/core";
import type {
	AvailableCommand,
	Decision,
	SessionConfigOption,
	SessionState,
	UserContent,
} from "@superset/chat/protocol";
import {
	useApprovals,
	useChatSession,
	useTimeline,
} from "@superset/chat/react";
import { MessageScroller } from "@superset/chat-ui/MessageScroller";
import { ChatHistorySidebarScroller } from "@superset/ui/chat-history-sidebar";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OpenFile } from "../../../../../../types";
import { ChatPaneActionsProvider } from "../../providers/ChatPaneActionsProvider";
import type { ChatForkTarget } from "../../types";
import { buildChatHandoffTranscript } from "../../utils/chatHandoffTranscript";
import { heldPromptQueue } from "../../utils/heldPromptQueue";
import { promptHistory } from "../../utils/promptHistory";
import { railMessages } from "../../utils/railMessages";
import { type AgentChoice, type AgentSwitcher, Composer } from "../Composer";
import { ConnectionNotice } from "../ConnectionNotice";
import { SessionHeader } from "../SessionHeader";
import { Transcript } from "../Transcript";
import { useStableList } from "./hooks/useStableList";

const RESUME_FOLLOW_PX = 24;
const NO_COMMANDS: AvailableCommand[] = [];
const NO_CONFIG_OPTIONS: SessionConfigOption[] = [];

const MODEL_OPTIONS_GRACE_MS = 1000;

export function SessionView({
	agentLabel,
	agentSwitch,
	canForkToWorktree,
	client,
	headerLeft,
	held,
	isActive,
	onModeChange,
	pendingPrompts,
	preferredModelLabel,
	onPendingPromptsSent,
	onFork,
	onSessionState,
	openFile,
	sessionId,
	workspaceId,
}: {
	client: SessionClient;
	sessionId: string;
	workspaceId: string;
	headerLeft?: ReactNode;
	held?: {
		notice: ReactNode;
		queued: UserContent[][];
		onQueue: (content: UserContent[]) => void;
	};
	isActive?: boolean;
	pendingPrompts: UserContent[][];
	/** Selected by name once the agent lists its models, before the first prompt goes out. */
	preferredModelLabel?: string;
	onPendingPromptsSent: () => void;
	onSessionState?: (session: SessionState | null) => void;
	/** The mode the user picked, so a resumed session can start in it again. */
	onModeChange?: (modeId: string) => void;
	/**
	 * Absent when the agent cannot branch its own session. The transcript is
	 * built here because only this view holds the timeline; a branch into
	 * another worktree cannot resume the session and is told it instead.
	 */
	onFork?: ((target: ChatForkTarget, transcript: string) => void) | undefined;
	canForkToWorktree?: boolean;
	/** Names the speaker in a handed-over transcript. */
	agentLabel?: string;
	/** The transcript goes with the switch: the next agent cannot load this session. */
	agentSwitch?: {
		currentPresetId: string;
		agents: AgentChoice[];
		onSwitch: (
			presetId: string,
			model: { id: string; label: string } | null,
			transcript: string,
			currentModeId: string | undefined,
		) => void;
	};
	openFile?: OpenFile;
}) {
	const session = useChatSession({ client });
	const timeline = useTimeline(session.snapshot);
	const rail = useStableList(
		useMemo(() => railMessages(timeline), [timeline]),
		(previous, next) =>
			previous.id === next.id &&
			previous.role === next.role &&
			previous.preview === next.preview,
	);
	const approvals = useApprovals(session.snapshot);
	const harness = session.snapshot.session?.harness;
	const history = useStableList(
		useMemo(() => promptHistory(timeline, harness), [timeline, harness]),
	);

	const configOptions = session.snapshot.session?.configOptions;
	const agentStatus = session.snapshot.session?.status;
	const [modelSettled, setModelSettled] = useState(
		preferredModelLabel === undefined,
	);
	const modelRequested = useRef(false);
	useEffect(() => {
		if (modelSettled || session.status !== "ready") return;
		if (configOptions === undefined) {
			// An agent that reports no options never sends them.
			if (agentStatus !== "idle") return;
			const timer = setTimeout(
				() => setModelSettled(true),
				MODEL_OPTIONS_GRACE_MS,
			);
			return () => clearTimeout(timer);
		}
		if (modelRequested.current) return;
		const option = configOptions.find((entry) => entry.category === "model");
		const wanted = option?.options.find(
			(entry) =>
				entry.label.toLowerCase() === preferredModelLabel?.toLowerCase(),
		);
		if (!option || !wanted || wanted.id === option.currentValue) {
			setModelSettled(true);
			return;
		}
		modelRequested.current = true;
		void session
			.setConfigOption(option.id, wanted.id)
			.finally(() => setModelSettled(true));
	}, [agentStatus, configOptions, modelSettled, preferredModelLabel, session]);

	const pendingSentRef = useRef(false);
	useEffect(() => {
		if (held || pendingPrompts.length === 0 || pendingSentRef.current) return;
		if (session.status !== "ready" || !modelSettled) return;
		pendingSentRef.current = true;
		for (const prompt of pendingPrompts) session.sendPrompt(prompt);
		onPendingPromptsSent();
	}, [held, pendingPrompts, session, onPendingPromptsSent, modelSettled]);

	const sessionState = session.snapshot.session;
	useEffect(() => {
		onSessionState?.(sessionState ?? null);
	}, [sessionState, onSessionState]);

	const runningTurnId = useMemo(() => {
		for (const turn of session.snapshot.turns.values()) {
			if (turn.status === "running") return turn.id;
		}
		return null;
	}, [session.snapshot.turns]);

	const snapshotItems = session.snapshot.items;
	const queuedPrompts = useStableList(
		useMemo(
			() => deriveQueuedPrompts({ items: snapshotItems }),
			[snapshotItems],
		),
	);

	const timelineRef = useRef(timeline);
	timelineRef.current = timeline;
	const snapshotRef = useRef(session.snapshot);
	snapshotRef.current = session.snapshot;
	const forkWithTranscript = useCallback(
		(target: ChatForkTarget) =>
			onFork?.(
				target,
				buildChatHandoffTranscript(
					timelineRef.current,
					snapshotRef.current,
					agentLabel ?? "Agent",
				),
			),
		[onFork, agentLabel],
	);
	const agentSwitcher = useMemo<AgentSwitcher | undefined>(
		() =>
			agentSwitch && {
				currentPresetId: agentSwitch.currentPresetId,
				agents: agentSwitch.agents,
				onSwitch: (presetId, model) =>
					agentSwitch.onSwitch(
						presetId,
						model,
						buildChatHandoffTranscript(
							timelineRef.current,
							snapshotRef.current,
							agentLabel ?? "Agent",
						),
						snapshotRef.current.session?.modeId,
					),
			},
		[agentSwitch, agentLabel],
	);
	const {
		cancelTurn,
		loadOlder,
		respondToApproval,
		sendPrompt,
		setConfigOption,
		setMode,
	} = session;
	const onRespond = useCallback(
		(approvalId: string, decision: Decision) =>
			void respondToApproval(approvalId, decision),
		[respondToApproval],
	);
	const onSetConfigOption = useCallback(
		(configId: string, value: string) => void setConfigOption(configId, value),
		[setConfigOption],
	);
	const onSetMode = useCallback(
		(modeId: string) => {
			onModeChange?.(modeId);
			void setMode(modeId);
		},
		[onModeChange, setMode],
	);
	const holdPrompt = held?.onQueue;
	const onSend = useCallback(
		(content: UserContent[], { steer }: { steer: boolean }) =>
			holdPrompt
				? holdPrompt(content)
				: sendPrompt(
						content,
						steer && runningTurnId
							? { expectedTurnId: runningTurnId }
							: undefined,
					),
		[holdPrompt, sendPrompt, runningTurnId],
	);
	const awaitingBackground = sessionState?.awaitingBackground === true;
	const onCancelTurn = useMemo(
		() =>
			runningTurnId && !awaitingBackground && !held
				? () => void cancelTurn(runningTurnId, { pauseQueue: true })
				: null,
		[runningTurnId, awaitingBackground, cancelTurn, held],
	);
	const promptQueue = useMemo(
		() => ({
			prompts: queuedPrompts,
			paused: sessionState?.queuePaused === true,
			actionable: sessionState?.queueControls === true,
			remove: session.removeQueuedPrompt,
			resume: session.resumeQueue,
			steer: session.steerQueuedPrompt,
		}),
		[
			queuedPrompts,
			sessionState?.queuePaused,
			sessionState?.queueControls,
			session.removeQueuedPrompt,
			session.resumeQueue,
			session.steerQueuedPrompt,
		],
	);

	const heldQueued = held?.queued;
	const heldQueue = useMemo(
		() => (heldQueued ? heldPromptQueue(heldQueued) : undefined),
		[heldQueued],
	);
	const connecting =
		session.unreachable ||
		(session.status === "ready" && session.connection === "closed");
	const booting = sessionState?.status === "starting";

	// w-full because the pane lays its children out in a row: without it this
	// sizes to its content and leaves the right of the pane empty.
	return (
		<ChatPaneActionsProvider openFile={openFile} workspaceId={workspaceId}>
			<div className="flex h-full min-h-0 w-full min-w-0 flex-col">
				{/* Only worth a row when it carries a control: the pane header above
				    already names the agent, and harness/status/connection repeated
				    under it read louder than the transcript. */}
				{headerLeft && (
					<SessionHeader
						connection={session.connection}
						left={headerLeft}
						session={session.snapshot.session}
					/>
				)}
				<MessageScroller.Provider
					autoScroll
					defaultScrollPosition="end"
					scrollEdgeThreshold={RESUME_FOLLOW_PX}
					scrollPreviousItemPeek={0}
				>
					<div className="@container relative flex min-h-0 flex-1">
						<Transcript
							approvals={approvals}
							canForkToWorktree={canForkToWorktree}
							groups={timeline}
							hasOlder={session.hasOlder}
							onDiscardPrompt={session.discardPrompt}
							onFork={onFork ? forkWithTranscript : undefined}
							onLoadOlder={loadOlder}
							onRespond={onRespond}
							onRetryPrompt={session.retryPrompt}
							outbox={session.outbox}
							snapshot={session.snapshot}
						/>
						{rail.length > 1 && (
							<ChatHistorySidebarScroller
								className="absolute inset-y-0 left-0 my-auto hidden h-fit max-h-full flex-col pl-3 @[56rem]:flex"
								messages={rail}
							/>
						)}
					</div>
				</MessageScroller.Provider>
				{held ? (
					<ConnectionNotice>{held.notice}</ConnectionNotice>
				) : (
					(connecting || booting) && (
						<ConnectionNotice>
							{connecting ? (
								<Trans>Connecting to the host service…</Trans>
							) : (
								<Trans>Starting the agent…</Trans>
							)}
						</ConnectionNotice>
					)
				)}
				<Composer
					agentSwitcher={agentSwitcher}
					availableCommands={sessionState?.availableCommands ?? NO_COMMANDS}
					configOptions={sessionState?.configOptions ?? NO_CONFIG_OPTIONS}
					onSetConfigOption={onSetConfigOption}
					modes={sessionState?.availableModes}
					currentModeId={sessionState?.modeId}
					onSetMode={onSetMode}
					draftKey={`chat-v3-draft:${sessionId}`}
					history={history}
					isActive={isActive}
					onCancelTurn={onCancelTurn}
					onSend={onSend}
					promptQueue={heldQueue ?? (held ? undefined : promptQueue)}
					workspaceId={workspaceId}
				/>
			</div>
		</ChatPaneActionsProvider>
	);
}
