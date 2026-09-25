import { BUILTIN_AGENT_IDS } from "@superset/shared/agent-catalog";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useRef } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	resolveMigratedPaneResume,
	type V1PaneAgentSessionSnapshot,
} from "renderer/lib/v1-migration/terminals";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useV2TerminalLauncher } from "../useV2TerminalLauncher";

/**
 * Create daemon sessions for terminals queued by the v1→v2 migration (D2:
 * lazy recreation — fresh shell at the v1 cwd, spawned on first workspace
 * open instead of during migration, so a big v1 install can't PTY-storm the
 * boot). Created entries are removed from the queue; failures stay queued
 * for the next open. Panes come from useAutoAdoptBackgroundSessions once
 * the sessions are running.
 *
 * When the source v1 pane had a resumable agent session (captured by the
 * electron hook server), the fresh terminal is seeded with an ended binding
 * so the pane auto-resumes it the same way as a killed v2 session. The
 * capture is read here — not frozen at migration time — because the pane
 * keeps living in v1 (and its agent keeps reporting) long after the
 * every-boot migration pass ledgers it.
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
	const { trpcClient } = useWorkspaceClient();
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
			// Pre-field entries lack v1PaneId; healed rows may surface it as
			// undefined rather than null, so filter by type, not by !== null.
			const paneIds = pending
				.map((t) => t.v1PaneId)
				.filter((id): id is string => typeof id === "string" && id.length > 0);
			let agentSessions: Record<string, V1PaneAgentSessionSnapshot> = {};
			if (paneIds.length > 0) {
				try {
					agentSessions =
						await electronTrpcClient.migration.readV1PaneAgentSessions.query({
							paneIds,
						});
				} catch (err) {
					// Without the capture we can't tell which terminals need a
					// resume seed — clearing them now would drop it permanently.
					// Leave the whole queue for the next open (creates no-op).
					console.warn("[v1-migration] agent session read failed", {
						workspaceId,
						err,
					});
					runningRef.current = false;
					return;
				}
			}

			const completed = new Set<string>();
			for (const terminal of pending) {
				try {
					// createSession is idempotent by terminalId, so a re-run after
					// an interrupted pass just no-ops on already-created sessions.
					await launcher.create({
						terminalId: terminal.terminalId,
						cwd: terminal.cwd ?? undefined,
					});
				} catch (err) {
					console.error("[v1-migration] pending terminal create failed", {
						workspaceId,
						terminalId: terminal.terminalId,
						err,
					});
					continue;
				}

				const resume = resolveMigratedPaneResume(
					terminal.v1PaneId ? agentSessions[terminal.v1PaneId] : undefined,
				);
				const agentId = resume
					? BUILTIN_AGENT_IDS.find((id) => id === resume.agentId)
					: undefined;
				if (resume && agentId) {
					// A failed seed keeps the entry queued so the next open
					// retries it (seedResumeCandidate is idempotent and never
					// overwrites a binding the terminal earned in the meantime).
					try {
						await trpcClient.terminalAgents.seedResumeCandidate.mutate({
							workspaceId,
							terminalId: terminal.terminalId,
							agentId,
							agentSessionId: resume.agentSessionId,
						});
					} catch (err) {
						console.warn("[v1-migration] resume candidate seed failed", {
							workspaceId,
							terminalId: terminal.terminalId,
							err,
						});
						continue;
					}
				}
				completed.add(terminal.terminalId);
			}
			if (completed.size > 0) {
				collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
					draft.pendingMigratedTerminals = (
						draft.pendingMigratedTerminals ?? []
					).filter((t) => !completed.has(t.terminalId));
				});
			}
			if (pending.length > 0) {
				// Nudge the session list so auto-adopt builds the panes now
				// rather than on the next natural refetch.
				await utils.terminal.list.invalidate({ workspaceId });
			}
			runningRef.current = false;
		})();
	}, [isLayoutReady, workspaceId, collections, launcher, trpcClient, utils]);
}
