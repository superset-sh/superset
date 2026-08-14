import type { SessionClient } from "@superset/chat/client";
import type { UserContent } from "@superset/chat/protocol";
import {
	useApprovals,
	useChatSession,
	useTimeline,
} from "@superset/chat/react";
import { Loader } from "@superset/ui/ai-elements/loader";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "../Composer";
import type { HarnessId } from "../NewSessionView";
import { SessionHeader } from "../SessionHeader";
import { Transcript } from "../Transcript";

export function SessionView({
	client,
	headerLeft,
	onForkSend,
	pendingFirstPrompt,
	onFirstPromptSent,
	sessionId,
}: {
	client: SessionClient;
	sessionId: string;
	headerLeft?: ReactNode;
	pendingFirstPrompt: UserContent[] | null;
	onFirstPromptSent: () => void;
	onForkSend?: (content: UserContent[], harness: HarnessId) => void;
}) {
	const session = useChatSession({ client });
	const [pendingHarness, setPendingHarness] = useState<HarnessId | null>(null);
	const timeline = useTimeline(session.snapshot);
	const approvals = useApprovals(session.snapshot);

	const firstPromptSentRef = useRef(false);
	useEffect(() => {
		if (!pendingFirstPrompt || firstPromptSentRef.current) return;
		if (session.status !== "ready") return;
		firstPromptSentRef.current = true;
		session.sendPrompt(pendingFirstPrompt);
		onFirstPromptSent();
	}, [pendingFirstPrompt, session, onFirstPromptSent]);

	const runningTurnId = useMemo(() => {
		for (const turn of session.snapshot.turns.values()) {
			if (turn.status === "running") return turn.id;
		}
		return null;
	}, [session.snapshot.turns]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<SessionHeader
				connection={session.connection}
				left={headerLeft}
				onHarnessSelect={
					onForkSend
						? (harness) =>
								setPendingHarness(
									harness === session.snapshot.session?.harness
										? null
										: harness,
								)
						: undefined
				}
				pendingHarness={pendingHarness}
				session={session.snapshot.session}
			/>
			{session.status === "loading" ? (
				<div className="flex flex-1 items-center justify-center">
					<Loader />
				</div>
			) : (
				<Transcript
					approvals={approvals}
					groups={timeline}
					hasOlder={session.hasOlder}
					onDiscardPrompt={session.discardPrompt}
					onLoadOlder={() => void session.loadOlder()}
					onRespond={(approvalId, decision) =>
						void session.respondToApproval(approvalId, decision)
					}
					onRetryPrompt={session.retryPrompt}
					outbox={session.outbox}
					snapshot={session.snapshot}
				/>
			)}
			{pendingHarness && (
				<div className="border-t border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
					Next message continues in{" "}
					<span className="font-mono">{pendingHarness}</span> — a new linked
					session seeded with this transcript.
				</div>
			)}
			<Composer
				disabled={session.status !== "ready"}
				draftKey={`chat-v3-draft:${sessionId}`}
				onCancelTurn={
					runningTurnId ? () => void session.cancelTurn(runningTurnId) : null
				}
				onSend={(content) => {
					if (pendingHarness && onForkSend) {
						onForkSend(content, pendingHarness);
						return null;
					}
					return session.sendPrompt(content);
				}}
				outbox={session.outbox}
			/>
		</div>
	);
}
