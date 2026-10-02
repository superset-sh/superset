import { Trans } from "@lingui/react/macro";
import type { SessionClient } from "@superset/chat/client";
import type { SessionState, UserContent } from "@superset/chat/protocol";
import {
	useApprovals,
	useChatSession,
	useTimeline,
} from "@superset/chat/react";
import { ChatHistorySidebar } from "@superset/ui/chat-history-sidebar";
import { Spinner } from "@superset/ui/spinner";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatForkTarget } from "../../types";
import { buildChatHandoffTranscript } from "../../utils/chatHandoffTranscript";
import { railMessages } from "../../utils/railMessages";
import { Composer } from "../Composer";
import { SessionHeader } from "../SessionHeader";
import { Transcript } from "../Transcript";

export function SessionView({
	agentLabel,
	canForkToWorktree,
	client,
	headerLeft,
	pendingFirstPrompt,
	onFirstPromptSent,
	onFork,
	onSessionState,
	sessionId,
	workspaceId,
}: {
	client: SessionClient;
	sessionId: string;
	workspaceId: string;
	headerLeft?: ReactNode;
	pendingFirstPrompt: UserContent[] | null;
	onFirstPromptSent: () => void;
	onSessionState?: (session: SessionState | null) => void;
	/**
	 * Absent when the agent cannot branch its own session. The transcript is
	 * built here because only this view holds the timeline; a branch into
	 * another worktree cannot resume the session and is told it instead.
	 */
	onFork?: ((target: ChatForkTarget, transcript: string) => void) | undefined;
	canForkToWorktree?: boolean;
	/** Names the speaker in a handed-over transcript. */
	agentLabel?: string;
}) {
	const session = useChatSession({ client });
	const timeline = useTimeline(session.snapshot);
	const rail = useMemo(
		() => railMessages(timeline, session.snapshot),
		[timeline, session.snapshot],
	);
	const [scrollRequest, setScrollRequest] = useState<{
		itemId: string;
		nonce: number;
	}>();
	const selectFromRail = useCallback((message: { id: string }) => {
		setScrollRequest((previous) => ({
			itemId: message.id,
			nonce: (previous?.nonce ?? 0) + 1,
		}));
	}, []);
	const approvals = useApprovals(session.snapshot);

	const firstPromptSentRef = useRef(false);
	useEffect(() => {
		if (!pendingFirstPrompt || firstPromptSentRef.current) return;
		if (session.status !== "ready") return;
		firstPromptSentRef.current = true;
		session.sendPrompt(pendingFirstPrompt);
		onFirstPromptSent();
	}, [pendingFirstPrompt, session, onFirstPromptSent]);

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

	// The stream is ready well before the agent is: the harness still has to
	// spawn and, when resuming, replay the whole transcript. Showing an empty
	// pane through that reads as a broken chat rather than a loading one.
	const booting = sessionState?.status === "starting" && timeline.length === 0;

	return (
		// w-full because the pane lays its children out in a row: without it this
		// sizes to its content and leaves the right of the pane empty.
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
			{session.status === "loading" || booting ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3">
					<Spinner className="size-5" />
					{booting && (
						<span className="text-muted-foreground text-xs">
							<Trans>Opening the conversation…</Trans>
						</span>
					)}
				</div>
			) : (
				<div className="flex min-h-0 flex-1">
					<Transcript
						approvals={approvals}
						canForkToWorktree={canForkToWorktree}
						groups={timeline}
						hasOlder={session.hasOlder}
						onDiscardPrompt={session.discardPrompt}
						onFork={
							onFork
								? (target) =>
										onFork(
											target,
											buildChatHandoffTranscript(
												timeline,
												session.snapshot,
												agentLabel ?? "Agent",
											),
										)
								: undefined
						}
						onLoadOlder={() => void session.loadOlder()}
						onRespond={(approvalId, decision) =>
							void session.respondToApproval(approvalId, decision)
						}
						onRetryPrompt={session.retryPrompt}
						outbox={session.outbox}
						scrollRequest={scrollRequest}
						snapshot={session.snapshot}
					/>
					{rail.length > 1 && (
						<ChatHistorySidebar
							className="hidden shrink-0 self-start py-6 pr-3 lg:block"
							messages={rail}
							onMessageSelect={selectFromRail}
						/>
					)}
				</div>
			)}
			<Composer
				availableCommands={session.snapshot.session?.availableCommands ?? []}
				disabled={session.status !== "ready"}
				draftKey={`chat-v3-draft:${sessionId}`}
				onCancelTurn={
					runningTurnId ? () => void session.cancelTurn(runningTurnId) : null
				}
				onSend={(content) => session.sendPrompt(content)}
				workspaceId={workspaceId}
			/>
		</div>
	);
}
