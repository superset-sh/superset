/**
 * Phase 1 dual-write bridge.
 *
 * After every tRPC poll result, translate the legacy ChatMessage[] shape
 * into the new v2 Message/Part model and push it into `useChatStore`.
 * The legacy chat UI is unaffected — it continues to read from tRPC
 * directly. The new store just shadows the same data so we can build
 * timeline components against it without flipping transports yet.
 *
 * Plan reference: 20260421-v2-chat-refactor-phased-plan.md §1.2.
 *
 * This effect is intentionally idempotent: it diffs on identity of the
 * input arrays and skips pushing when nothing has changed.
 */

import type {
	fromLegacyMessages as FromLegacyFn,
	LegacyMessage,
} from "@superset/chat/client";
import { fromLegacyMessages } from "@superset/chat/client";
import { useEffect, useMemo, useRef } from "react";
import { useChatStore } from "./chatStore";

export interface UseDualWriteFromLegacyInput {
	sessionId: string | null;
	/** Legacy message array from tRPC `listMessages`. */
	historicalMessages: readonly LegacyMessage[] | undefined;
	/** Whether the session is currently streaming an assistant turn. */
	isRunning: boolean;
	/** ID of the currently-streaming assistant message, if any. */
	activeMessageId: string | null;
}

export function useDualWriteFromLegacy({
	sessionId,
	historicalMessages,
	isRunning,
	activeMessageId,
}: UseDualWriteFromLegacyInput): void {
	const applySnapshot = useChatStore((s) => s.applySessionSnapshot);
	// Track the last pushed snapshot to avoid redundant writes.
	const lastPushedRef = useRef<{
		sessionId: string | null;
		reference: readonly LegacyMessage[] | undefined;
		isRunning: boolean;
		activeMessageId: string | null;
	}>({
		sessionId: null,
		reference: undefined,
		isRunning: false,
		activeMessageId: null,
	});

	const translated = useMemo(() => {
		if (!sessionId || !historicalMessages) return null;
		return translate([...historicalMessages], {
			sessionID: sessionId,
			isStreaming: isRunning,
			activeMessageID: activeMessageId ?? undefined,
		});
	}, [sessionId, historicalMessages, isRunning, activeMessageId]);

	useEffect(() => {
		if (!sessionId || !translated) return;
		const prev = lastPushedRef.current;
		const unchanged =
			prev.sessionId === sessionId &&
			prev.reference === historicalMessages &&
			prev.isRunning === isRunning &&
			prev.activeMessageId === activeMessageId;
		if (unchanged) return;

		applySnapshot(sessionId, {
			messages: translated.messages,
			parts: translated.parts,
			status: translated.status,
			historyMore: false,
		});
		lastPushedRef.current = {
			sessionId,
			reference: historicalMessages,
			isRunning,
			activeMessageId,
		};
	}, [
		sessionId,
		historicalMessages,
		isRunning,
		activeMessageId,
		translated,
		applySnapshot,
	]);
}

// Wrapped so tests can mock `fromLegacyMessages` via module boundary if
// ever needed. Keeps the hook body dependency-free for the useMemo above.
const translate: typeof FromLegacyFn = (legacy, options) =>
	fromLegacyMessages(legacy as LegacyMessage[], options);
