import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import type { ChatMastraRawSnapshot } from "../../ChatMastraInterface/types";

interface UseChatMastraRawSnapshotOptions {
	sessionId: string | null;
}

interface UseChatMastraRawSnapshotReturn {
	snapshotAvailableForSession: boolean;
	debugSummary: string | null;
	handleRawSnapshotChange: (snapshot: ChatMastraRawSnapshot) => void;
	handleCopyRawSnapshot: () => Promise<void>;
}

function toDebugSummary(snapshot: ChatMastraRawSnapshot): string {
	return [
		`run:${snapshot.isRunning ? 1 : 0}`,
		`display:${snapshot.displayIsRunning ? 1 : 0}`,
		`await:${snapshot.isAwaitingAssistant ? 1 : 0}`,
		`submit:${snapshot.submitStatus}`,
		`cur:${snapshot.currentMessage ? 1 : 0}`,
		`msg:${snapshot.messageCount}`,
		`tools:${snapshot.activeToolsCount}`,
		`subs:${snapshot.activeSubagentsCount}`,
		`approval:${snapshot.hasPendingApproval ? 1 : 0}`,
		`plan:${snapshot.hasPendingPlanApproval ? 1 : 0}`,
		`question:${snapshot.hasPendingQuestion ? 1 : 0}`,
		`err:${snapshot.error ? 1 : 0}`,
	].join(" ");
}

export function useChatMastraRawSnapshot({
	sessionId,
}: UseChatMastraRawSnapshotOptions): UseChatMastraRawSnapshotReturn {
	const rawSnapshotRef = useRef<ChatMastraRawSnapshot | null>(null);
	const debugSummaryRef = useRef<string | null>(null);
	const [rawSnapshotSessionId, setRawSnapshotSessionId] = useState<
		string | null
	>(null);
	const [debugSummary, setDebugSummary] = useState<string | null>(null);

	const handleRawSnapshotChange = useCallback(
		(snapshot: ChatMastraRawSnapshot) => {
			rawSnapshotRef.current = snapshot;
			const nextDebugSummary = toDebugSummary(snapshot);
			if (debugSummaryRef.current !== nextDebugSummary) {
				debugSummaryRef.current = nextDebugSummary;
				setDebugSummary(nextDebugSummary);
				console.debug("[chat-mastra] ui snapshot", {
					sessionId: snapshot.sessionId,
					cwd: snapshot.cwd,
					summary: nextDebugSummary,
					currentMessageId: snapshot.currentMessage?.id ?? null,
				});
			}
			setRawSnapshotSessionId((previousSessionId) =>
				previousSessionId === snapshot.sessionId
					? previousSessionId
					: snapshot.sessionId,
			);
		},
		[],
	);

	const handleCopyRawSnapshot = useCallback(async () => {
		const rawSnapshot = rawSnapshotRef.current;
		if (!rawSnapshot || rawSnapshot.sessionId !== sessionId) {
			toast.error("No raw chat data to copy yet");
			return;
		}

		if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
			toast.error("Clipboard API is unavailable");
			return;
		}

		try {
			await navigator.clipboard.writeText(JSON.stringify(rawSnapshot, null, 2));
			toast.success("Copied raw chat JSON");
		} catch {
			toast.error("Failed to copy raw chat JSON");
		}
	}, [sessionId]);

	return {
		snapshotAvailableForSession:
			Boolean(rawSnapshotRef.current) && rawSnapshotSessionId === sessionId,
		debugSummary,
		handleRawSnapshotChange,
		handleCopyRawSnapshot,
	};
}
