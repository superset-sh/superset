import type { UIMessage } from "@superset/durable-session/react";
import { useEffect, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { extractTitleFromMessages } from "../../utils/extract-title";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface UseClaudeCodeHistoryOptions {
	sessionId: string;
	liveMessages: UIMessage[];
	hasAutoTitled: React.MutableRefObject<boolean>;
	onRename: (title: string) => void;
}

export function useClaudeCodeHistory({
	sessionId,
	liveMessages,
	hasAutoTitled,
	onRename,
}: UseClaudeCodeHistoryOptions) {
	const isClaudeCodeSession = UUID_RE.test(sessionId);

	const { data: claudeMessages } =
		electronTrpc.aiChat.getClaudeSessionMessages.useQuery(
			{ sessionId },
			{ enabled: isClaudeCodeSession, staleTime: 60_000 },
		);

	const allMessages = useMemo(() => {
		const history = (claudeMessages ?? []) as UIMessage[];
		if (history.length === 0) return liveMessages;
		if (liveMessages.length === 0) return history;
		return [...history, ...liveMessages];
	}, [claudeMessages, liveMessages]);

	useEffect(() => {
		if (hasAutoTitled.current) return;
		if (!isClaudeCodeSession || !claudeMessages?.length) return;

		hasAutoTitled.current = true;

		const title = extractTitleFromMessages(claudeMessages);
		if (title) onRename(title);
	}, [claudeMessages, isClaudeCodeSession, hasAutoTitled, onRename]);

	return { allMessages, isClaudeCodeSession };
}
