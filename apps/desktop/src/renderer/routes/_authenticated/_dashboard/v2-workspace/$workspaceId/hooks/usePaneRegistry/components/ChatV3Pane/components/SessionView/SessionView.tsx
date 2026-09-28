import { useLingui } from "@lingui/react/macro";
import type { ChatTransport, SessionClient } from "@superset/chat/client";
import { displayText } from "@superset/chat/core";
import type { Item, UserContent } from "@superset/chat/protocol";
import {
	useApprovals,
	useChatSession,
	useTimeline,
} from "@superset/chat/react";
import { Loader } from "@superset/ui/ai-elements/loader";
import { toast } from "@superset/ui/sonner";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePins } from "../../hooks/usePins";
import { Composer } from "../Composer";
import { derivePinLabel, PinsPanel } from "../PinsPanel";
import { SessionHeader } from "../SessionHeader";
import { Transcript } from "../Transcript";

function formatQuote(text: string): string {
	return text
		.split("\n")
		.map((line) => (line.trim() === "" ? ">" : `> ${line}`))
		.join("\n");
}

// Must stay under the server's snapshotText limit (see addPinInputSchema).
const MAX_SNAPSHOT_CHARS = 15000;

// displayText only resolves agent/reasoning text — user message text lives
// on the item itself. Item is a loose union (UnknownItem has an open-ended
// shape), so read content defensively instead of relying on narrowing.
function userMessageText(item: Item): string {
	if (item.kind !== "user_message" || !("content" in item)) return "";
	const content: unknown = item.content;
	if (!Array.isArray(content)) return "";
	return content
		.map((entry) => {
			if (typeof entry !== "object" || entry === null) return null;
			const record = entry as { type?: unknown; text?: unknown };
			return record.type === "text" && typeof record.text === "string"
				? record.text
				: null;
		})
		.filter((line): line is string => line !== null)
		.join("\n");
}

export function SessionView({
	client,
	headerLeft,
	pendingFirstPrompt,
	onFirstPromptSent,
	sessionId,
	transport,
}: {
	client: SessionClient;
	sessionId: string;
	transport: ChatTransport;
	headerLeft?: ReactNode;
	pendingFirstPrompt: UserContent[] | null;
	onFirstPromptSent: () => void;
}) {
	const session = useChatSession({ client });
	const timeline = useTimeline(session.snapshot);
	const approvals = useApprovals(session.snapshot);
	const { t } = useLingui();
	const { pins, pinnedItemIds, addPin, removePin, renamePin } = usePins(
		transport,
		sessionId,
	);
	const [jumpToItemId, setJumpToItemId] = useState<{
		itemId: string;
		nonce: number;
	} | null>(null);
	const [insertRequest, setInsertRequest] = useState<{
		text: string;
		nonce: number;
	} | null>(null);

	const handlePinError = useCallback(() => {
		toast.error(t({ message: "Could not update pin" }));
	}, [t]);

	const handleTogglePin = useCallback(
		(item: Item) => {
			if (pinnedItemIds.has(item.id)) {
				removePin(item.id).catch(handlePinError);
				return;
			}
			// displayText only resolves agent/reasoning text — user message text
			// lives on the item itself.
			const userText = userMessageText(item);
			const fullText =
				userText !== "" ? userText : displayText(session.snapshot, item.id);
			if (fullText.trim() === "") return;
			const text =
				fullText.length > MAX_SNAPSHOT_CHARS
					? `${fullText.slice(0, MAX_SNAPSHOT_CHARS)}…`
					: fullText;
			addPin(item.id, derivePinLabel(text), text).catch(handlePinError);
		},
		[addPin, handlePinError, pinnedItemIds, removePin, session.snapshot],
	);

	const handleRenamePin = useCallback(
		(itemId: string, label: string) => {
			renamePin(itemId, label).catch(handlePinError);
		},
		[handlePinError, renamePin],
	);

	const handleUnpin = useCallback(
		(itemId: string) => {
			removePin(itemId).catch(handlePinError);
		},
		[handlePinError, removePin],
	);

	const handleQuote = useCallback((text: string) => {
		if (text.trim() === "") return;
		setInsertRequest({ text: formatQuote(text), nonce: Date.now() });
	}, []);

	const handleJump = useCallback((itemId: string) => {
		setJumpToItemId({ itemId, nonce: Date.now() });
	}, []);

	const handleJumpSettled = useCallback(() => setJumpToItemId(null), []);
	const handleInsertConsumed = useCallback(() => setInsertRequest(null), []);

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
		<div className="flex h-full min-h-0 flex-1 flex-col">
			<SessionHeader
				connection={session.connection}
				left={headerLeft}
				session={session.snapshot.session}
			/>
			{session.status === "loading" ? (
				<div className="flex flex-1 items-center justify-center">
					<Loader />
				</div>
			) : (
				<>
					<PinsPanel
						onJump={handleJump}
						onQuote={handleQuote}
						onRename={handleRenamePin}
						onUnpin={handleUnpin}
						pins={pins}
					/>
					<Transcript
						approvals={approvals}
						groups={timeline}
						hasOlder={session.hasOlder}
						jumpToItemId={jumpToItemId}
						onDiscardPrompt={session.discardPrompt}
						onJumpSettled={handleJumpSettled}
						onLoadOlder={() => void session.loadOlder()}
						onQuoteText={handleQuote}
						onRespond={(approvalId, decision) =>
							void session.respondToApproval(approvalId, decision)
						}
						onRetryPrompt={session.retryPrompt}
						onTogglePin={handleTogglePin}
						outbox={session.outbox}
						pinnedItemIds={pinnedItemIds}
						snapshot={session.snapshot}
					/>
				</>
			)}
			<Composer
				disabled={session.status !== "ready"}
				draftKey={`chat-v3-draft:${sessionId}`}
				insertRequest={insertRequest}
				onCancelTurn={
					runningTurnId ? () => void session.cancelTurn(runningTurnId) : null
				}
				onInsertConsumed={handleInsertConsumed}
				onSend={(content) => session.sendPrompt(content)}
				outbox={session.outbox}
			/>
		</div>
	);
}
