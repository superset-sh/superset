/**
 * React wrapper around packages/chat's `startStream`. Subscribes for the
 * given session when the transport is available, pipes every applied
 * event into `useChatStore.applyStreamEvent`, and tears down cleanly on
 * unmount / session change.
 *
 * Host-service hasn't shipped the observable endpoint yet (Phase 6.4).
 * Until then the `subscribe` / `fetchSnapshot` props are optional and,
 * when omitted, this hook is a no-op and the existing dual-write polling
 * path stays in charge. Once the server lands, flipping a single flag
 * in ChatSurface switches transports.
 */

import type {
	SessionSnapshotResult,
	StreamFetchSnapshot,
	StreamSubscribe,
} from "@superset/chat/client";
import { startStream } from "@superset/chat/client";
import type { ChatStreamEvent } from "@superset/chat/shared";
import { useEffect } from "react";
import { useChatStore } from "../../../../store";

export interface UseChatStreamInput {
	sessionId: string | null;
	/**
	 * Transport-provided subscribe function. If undefined, streaming is
	 * inactive and the caller's polling path (dual-write) remains
	 * authoritative.
	 */
	subscribe?: StreamSubscribe;
	fetchSnapshot?: StreamFetchSnapshot;
	/** Enable/disable flag; defaults to true when transport is present. */
	enabled?: boolean;
}

export function useChatStream({
	sessionId,
	subscribe,
	fetchSnapshot,
	enabled = true,
}: UseChatStreamInput): void {
	const applyStreamEvent = useChatStore((s) => s.applyStreamEvent);

	useEffect(() => {
		if (!enabled) return;
		if (!sessionId) return;
		if (!subscribe || !fetchSnapshot) return;

		const handle = startStream({
			sessionID: sessionId,
			subscribe,
			fetchSnapshot,
			sink: {
				applyEvent: (event: ChatStreamEvent) => {
					if (event.type === "session.snapshot") {
						// Snapshot events replace the session slice via the
						// store's own applyStreamEvent → applySessionSnapshot.
						applyStreamEvent(event);
						return;
					}
					applyStreamEvent(event);
				},
			},
			logger:
				process.env.NODE_ENV === "development"
					? {
							onBootstrapStart: () =>
								console.debug(
									"[chat-stream] bootstrap start",
									sessionId,
								),
							onBootstrapComplete: (seq) =>
								console.debug("[chat-stream] bootstrap ok", seq),
							onRecoveryStart: (reason) =>
								console.debug("[chat-stream] recover", reason),
							onRecoveryComplete: (seq) =>
								console.debug("[chat-stream] recover ok", seq),
							onError: (error, phase) =>
								console.warn(
									"[chat-stream] error",
									phase,
									error,
								),
							onClose: () =>
								console.debug(
									"[chat-stream] close",
									sessionId,
								),
						}
					: undefined,
		});
		return () => handle.stop();
	}, [applyStreamEvent, enabled, fetchSnapshot, sessionId, subscribe]);
}

/**
 * Placeholder helper — constructs a `SessionSnapshotResult` from the
 * pieces the server will eventually provide. Exported so 6.3's wiring
 * (and future tests) can stub the transport once the endpoint exists.
 */
export function asSnapshotResult(
	event: SessionSnapshotResult["event"],
): SessionSnapshotResult {
	return { sequence: event.sequence, event };
}
