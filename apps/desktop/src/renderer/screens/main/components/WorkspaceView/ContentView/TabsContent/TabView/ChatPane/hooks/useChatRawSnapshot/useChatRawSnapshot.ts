import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import type { ChatRawSnapshot } from "../../ChatPaneInterface/types";

interface UseChatRawSnapshotOptions {
	sessionId: string | null;
}

interface UseChatRawSnapshotReturn {
	snapshotAvailableForSession: boolean;
	handleRawSnapshotChange: (snapshot: ChatRawSnapshot) => void;
	handleCopyRawSnapshot: () => Promise<void>;
}

export function useChatRawSnapshot({
	sessionId,
}: UseChatRawSnapshotOptions): UseChatRawSnapshotReturn {
	const rawSnapshotRef = useRef<ChatRawSnapshot | null>(null);
	const [rawSnapshotSessionId, setRawSnapshotSessionId] = useState<
		string | null
	>(null);

	const handleRawSnapshotChange = useCallback((snapshot: ChatRawSnapshot) => {
		rawSnapshotRef.current = snapshot;
		setRawSnapshotSessionId((previousSessionId) =>
			previousSessionId === snapshot.sessionId
				? previousSessionId
				: snapshot.sessionId,
		);
	}, []);

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
		handleRawSnapshotChange,
		handleCopyRawSnapshot,
	};
}
