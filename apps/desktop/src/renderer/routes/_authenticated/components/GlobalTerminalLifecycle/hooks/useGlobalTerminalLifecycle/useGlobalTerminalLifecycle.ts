import type { WorkspaceState } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { consumeTerminalBackgroundIntent } from "renderer/lib/terminal/terminal-background-intents";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	extractPaneLocations,
	extractWorkspaceIds,
	getRemovedPaneLocations,
	type PaneLifecycleRow,
} from "../../../utils/paneLifecycleRows";

/** Grace period for cross-workspace pane moves before terminal cleanup. */
const RELEASE_DELAY_MS = 500;

interface TerminalPaneData {
	terminalId: string;
}

interface PendingTerminalCleanup {
	workspaceId: string;
	timer: ReturnType<typeof setTimeout> | null;
}

function getTerminalId(
	pane: WorkspaceState<unknown>["tabs"][number]["panes"][string],
): string | null {
	if (pane.kind !== "terminal") return null;
	if (!pane.data || typeof pane.data !== "object") return null;
	const data = pane.data as Partial<TerminalPaneData>;
	return typeof data.terminalId === "string" ? data.terminalId : null;
}

function extractTerminalLocations(
	rows: PaneLifecycleRow[],
): Map<string, string> {
	return extractPaneLocations(rows, getTerminalId);
}

function cleanupRemovedTerminal({
	terminalId,
	workspaceId,
	hostUrlByWorkspaceId,
}: {
	terminalId: string;
	workspaceId: string;
	hostUrlByWorkspaceId: Map<string, string>;
}) {
	if (consumeTerminalBackgroundIntent(terminalId)) {
		terminalRuntimeRegistry.release(terminalId);
		return;
	}

	terminalRuntimeRegistry.dispose(terminalId);
	const hostUrl = hostUrlByWorkspaceId.get(workspaceId);
	if (!hostUrl) {
		console.warn(
			"[GlobalTerminalLifecycle] Missing host URL while killing removed terminal",
			{ terminalId, workspaceId },
		);
		return;
	}

	getHostServiceClientByUrl(hostUrl)
		.terminal.killSession.mutate({ terminalId })
		.catch((error) => {
			console.warn(
				"[GlobalTerminalLifecycle] Failed to kill removed terminal",
				{ terminalId, workspaceId, error },
			);
		});
}

export function useGlobalTerminalLifecycle() {
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();
	const prevTerminalLocationsRef = useRef<Map<string, string>>(new Map());
	const pendingCleanups = useRef<Map<string, PendingTerminalCleanup>>(
		new Map(),
	);

	const { data: allWorkspaceRows = [] } = useLiveQuery(
		(query) =>
			query.from({
				v2WorkspaceLocalState: collections.v2WorkspaceLocalState,
			}),
		[collections],
	);

	const { data: workspacesWithHosts = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2Workspaces: collections.v2Workspaces })
				.leftJoin({ hosts: collections.v2Hosts }, ({ v2Workspaces, hosts }) =>
					eq(v2Workspaces.hostId, hosts.id),
				)
				.select(({ v2Workspaces, hosts }) => ({
					workspaceId: v2Workspaces.id,
					hostId: v2Workspaces.hostId,
					hostMachineId: hosts?.machineId ?? null,
				})),
		[collections],
	);

	const hostUrlByWorkspaceId = useMemo(() => {
		const urls = new Map<string, string>();
		for (const workspace of workspacesWithHosts) {
			if (workspace.hostMachineId === machineId) {
				if (activeHostUrl) {
					urls.set(workspace.workspaceId, activeHostUrl);
				}
				continue;
			}

			if (workspace.hostId) {
				urls.set(
					workspace.workspaceId,
					`${env.RELAY_URL}/hosts/${workspace.hostId}`,
				);
			}
		}
		return urls;
	}, [activeHostUrl, machineId, workspacesWithHosts]);

	useEffect(() => {
		const rows = allWorkspaceRows as PaneLifecycleRow[];
		const currentTerminalLocations = extractTerminalLocations(rows);
		const currentWorkspaceIds = extractWorkspaceIds(rows);
		const prevTerminalLocations = prevTerminalLocationsRef.current;

		for (const terminalId of currentTerminalLocations.keys()) {
			const pending = pendingCleanups.current.get(terminalId);
			if (pending?.timer) {
				clearTimeout(pending.timer);
			}
			pendingCleanups.current.delete(terminalId);
		}

		// If a pane was authoritatively removed but the owner row disappeared
		// before the grace timer fired, keep waiting until that row is present
		// again. That avoids releasing active renderer state during sleep/wake
		// while still cleaning up when the post-removal layout comes back.
		for (const [terminalId, pending] of pendingCleanups.current) {
			if (pending.timer) continue;
			if (currentWorkspaceIds.has(pending.workspaceId)) {
				pendingCleanups.current.delete(terminalId);
				cleanupRemovedTerminal({
					terminalId,
					workspaceId: pending.workspaceId,
					hostUrlByWorkspaceId,
				});
			}
		}

		const removedLocations = getRemovedPaneLocations({
			previousLocations: prevTerminalLocations,
			currentLocations: currentTerminalLocations,
			currentWorkspaceIds,
		});

		for (const { id: terminalId, workspaceId } of removedLocations) {
			if (pendingCleanups.current.has(terminalId)) continue;

			const timer = setTimeout(() => {
				const freshRows = Array.from(
					collections.v2WorkspaceLocalState.state.values(),
				) as PaneLifecycleRow[];
				const freshLocations = extractTerminalLocations(freshRows);
				const freshWorkspaceIds = extractWorkspaceIds(freshRows);

				if (freshLocations.has(terminalId)) {
					pendingCleanups.current.delete(terminalId);
					return;
				}

				if (freshWorkspaceIds.has(workspaceId)) {
					pendingCleanups.current.delete(terminalId);
					cleanupRemovedTerminal({
						terminalId,
						workspaceId,
						hostUrlByWorkspaceId,
					});
					return;
				}

				const pending = pendingCleanups.current.get(terminalId);
				if (pending) {
					pending.timer = null;
				}
			}, RELEASE_DELAY_MS);

			pendingCleanups.current.set(terminalId, { workspaceId, timer });
		}

		prevTerminalLocationsRef.current = currentTerminalLocations;
	}, [allWorkspaceRows, collections, hostUrlByWorkspaceId]);

	useEffect(() => {
		return () => {
			for (const pending of pendingCleanups.current.values()) {
				if (pending.timer) {
					clearTimeout(pending.timer);
				}
			}
			pendingCleanups.current.clear();
		};
	}, []);
}
