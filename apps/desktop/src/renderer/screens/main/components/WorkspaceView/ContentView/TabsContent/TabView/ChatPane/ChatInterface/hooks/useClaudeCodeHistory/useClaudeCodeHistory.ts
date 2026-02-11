import type { UIMessage } from "@superset/durable-session/react";
import { useEffect, useMemo, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { extractTitleFromMessages } from "../../utils/extract-title";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface UseClaudeCodeHistoryOptions {
	sessionId: string;
	liveMessages: UIMessage[];
	onRename: (title: string) => void;
}

export function useClaudeCodeHistory({
	sessionId,
	liveMessages,
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

	// Auto-titling: owned entirely by this hook.
	// Titles from Claude Code history (claudeMessages) or live messages.
	const hasAutoTitled = useRef(false);

	// Reset when session changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: must reset when session changes
	useEffect(() => {
		hasAutoTitled.current = false;
	}, [sessionId]);

	// Title from Claude Code history (available immediately)
	useEffect(() => {
		if (hasAutoTitled.current) return;
		if (!isClaudeCodeSession || !claudeMessages?.length) return;

		hasAutoTitled.current = true;
		const title = extractTitleFromMessages(claudeMessages);
		if (title) onRename(title);
	}, [claudeMessages, isClaudeCodeSession, onRename]);

	// Title from live messages (for non-Claude-Code sessions or new sessions)
	useEffect(() => {
		if (hasAutoTitled.current || !sessionId) return;

		const userMsg = liveMessages.find((m) => m.role === "user");
		const assistantMsg = liveMessages.find((m) => m.role === "assistant");
		if (!userMsg || !assistantMsg) return;

		hasAutoTitled.current = true;
		const title = extractTitleFromMessages(liveMessages) ?? "Chat";
		onRename(title);
	}, [liveMessages, sessionId, onRename]);

	return { allMessages, isClaudeCodeSession };
}
