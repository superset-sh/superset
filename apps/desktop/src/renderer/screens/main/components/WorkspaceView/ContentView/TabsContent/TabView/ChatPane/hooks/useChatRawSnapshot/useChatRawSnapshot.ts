import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type { ChatRawSnapshot } from "../../ChatPaneInterface/types";

interface UseChatRawSnapshotOptions {
	sessionId: string | null;
}

interface UseChatRawSnapshotReturn {
	snapshotAvailableForSession: boolean;
	handleRawSnapshotChange: (snapshot: ChatRawSnapshot) => void;
	handleCopyRawSnapshot: () => void;
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

	const { copyToClipboard } = useCopyToClipboard();

	const handleCopyRawSnapshot = useCallback(() => {
		const rawSnapshot = rawSnapshotRef.current;
		if (!rawSnapshot || rawSnapshot.sessionId !== sessionId) {
			toast.error("No raw chat data to copy yet");
			return;
		}

		copyToClipboard(JSON.stringify(rawSnapshot, null, 2));
		toast.success("Copied raw chat JSON");
	}, [sessionId, copyToClipboard]);

	return {
		snapshotAvailableForSession:
			Boolean(rawSnapshotRef.current) && rawSnapshotSessionId === sessionId,
		handleRawSnapshotChange,
		handleCopyRawSnapshot,
	};
}
