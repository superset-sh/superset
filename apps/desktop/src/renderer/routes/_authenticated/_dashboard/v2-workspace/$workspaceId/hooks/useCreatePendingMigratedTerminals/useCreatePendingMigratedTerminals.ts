import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useRef } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useV2TerminalLauncher } from "../useV2TerminalLauncher";

/**
 * Create daemon sessions for terminals queued by the v1→v2 migration (D2:
 * lazy recreation — fresh shell at the v1 cwd, spawned on first workspace
 * open instead of during migration, so a big v1 install can't PTY-storm the
 * boot). Created entries are removed from the queue; failures stay queued
 * for the next open. Panes come from useAutoAdoptBackgroundSessions once
 * the sessions are running.
 */
export function useCreatePendingMigratedTerminals({
	workspaceId,
	isLayoutReady,
}: {
	workspaceId: string;
	isLayoutReady: boolean;
}): void {
	const collections = useCollections();
	const launcher = useV2TerminalLauncher();
	const utils = workspaceTrpc.useUtils();
	const runningRef = useRef(false);

	useEffect(() => {
		if (!isLayoutReady || runningRef.current) return;
		const pending =
			collections.v2WorkspaceLocalState.get(workspaceId)
				?.pendingMigratedTerminals ?? [];
		if (pending.length === 0) return;
		runningRef.current = true;

		void (async () => {
			const created = new Set<string>();
			for (const terminal of pending) {
				try {
					// createSession is idempotent by terminalId, so a re-run after
					// an interrupted pass just no-ops on already-created sessions.
					await launcher.create({
						terminalId: terminal.terminalId,
						cwd: terminal.cwd ?? undefined,
					});
					created.add(terminal.terminalId);
				} catch (err) {
					console.error("[v1-migration] pending terminal create failed", {
						workspaceId,
						terminalId: terminal.terminalId,
						err,
					});
				}
			}
			if (created.size > 0) {
				collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
					draft.pendingMigratedTerminals = (
						draft.pendingMigratedTerminals ?? []
					).filter((t) => !created.has(t.terminalId));
				});
				// Nudge the session list so auto-adopt builds the panes now
				// rather than on the next natural refetch.
				await utils.terminal.listSessions.invalidate({ workspaceId });
			}
			runningRef.current = false;
		})();
	}, [isLayoutReady, workspaceId, collections, launcher, utils]);
}
