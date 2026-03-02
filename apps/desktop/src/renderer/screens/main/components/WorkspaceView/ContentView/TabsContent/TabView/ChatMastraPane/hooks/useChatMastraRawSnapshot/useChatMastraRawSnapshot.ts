import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import type { ChatMastraRawSnapshot } from "../../ChatMastraInterface/types";

interface UseChatMastraRawSnapshotOptions {
	sessionId: string | null;
}

interface UseChatMastraRawSnapshotReturn {
	snapshotAvailableForSession: boolean;
	handleRawSnapshotChange: (snapshot: ChatMastraRawSnapshot) => void;
	handleCopyRawSnapshot: () => Promise<void>;
}

export function useChatMastraRawSnapshot({
	sessionId,
}: UseChatMastraRawSnapshotOptions): UseChatMastraRawSnapshotReturn {
	const rawSnapshotRef = useRef<ChatMastraRawSnapshot | null>(null);
	const [rawSnapshotSessionId, setRawSnapshotSessionId] = useState<
		string | null
	>(null);

	const handleRawSnapshotChange = useCallback(
		(snapshot: ChatMastraRawSnapshot) => {
			rawSnapshotRef.current = snapshot;
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
		handleRawSnapshotChange,
		handleCopyRawSnapshot,
	};
}
