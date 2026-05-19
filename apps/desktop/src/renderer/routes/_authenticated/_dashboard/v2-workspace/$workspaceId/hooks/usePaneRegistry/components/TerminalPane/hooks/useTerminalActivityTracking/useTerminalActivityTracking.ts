import { useEffect, useRef } from "react";
import { useUpdateLastActivityAt } from "renderer/hooks/useUpdateLastActivityAt";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";

/** Skips the initial buffer replay that fires when attaching to a terminal. */
const ACTIVITY_GRACE_PERIOD_MS = 5_000;
/** Minimum interval between successive lastActivityAt updates. */
const ACTIVITY_DEBOUNCE_MS = 30_000;

/**
 * Pure logic for activity tracking — no React, easy to test.
 *
 * Create once per subscription lifetime; call `handleData` on every
 * user-input event. The tracker decides whether enough time has elapsed
 * to propagate the update.
 */
export function trackTerminalActivity(startTime: number) {
	let lastUpdate = 0;

	return {
		handleData(
			updateLastActivityAt: (workspaceId: string) => void,
			workspaceId: string,
			now: number = Date.now(),
		) {
			const sinceStart = now - startTime;
			const sinceLast = now - lastUpdate;
			if (
				sinceStart > ACTIVITY_GRACE_PERIOD_MS &&
				sinceLast > ACTIVITY_DEBOUNCE_MS
			) {
				lastUpdate = now;
				updateLastActivityAt(workspaceId);
			}
		},
	};
}

interface UseTerminalActivityTrackingOptions {
	terminalId: string;
	terminalInstanceId: string;
	workspaceId: string;
	connectionState: string;
}

/**
 * Subscribes to user keystrokes on the xterm instance and
 * periodically updates `lastActivityAt` for the workspace so the
 * sidebar "sort by recent" feature works for v2 terminals.
 */
export function useTerminalActivityTracking({
	terminalId,
	terminalInstanceId,
	workspaceId,
	connectionState,
}: UseTerminalActivityTrackingOptions): void {
	const updateLastActivityAt = useUpdateLastActivityAt();
	const updateRef = useRef(updateLastActivityAt);
	updateRef.current = updateLastActivityAt;

	// biome-ignore lint/correctness/useExhaustiveDependencies: connectionState re-derives the terminal ref after reconnect
	useEffect(() => {
		const terminal = terminalRuntimeRegistry.getTerminal(
			terminalId,
			terminalInstanceId,
		);
		if (!terminal) return;

		const tracker = trackTerminalActivity(Date.now());
		const subscription = terminal.onData(() => {
			tracker.handleData(updateRef.current, workspaceId);
		});

		return () => subscription.dispose();
	}, [terminalId, terminalInstanceId, workspaceId, connectionState]);
}
