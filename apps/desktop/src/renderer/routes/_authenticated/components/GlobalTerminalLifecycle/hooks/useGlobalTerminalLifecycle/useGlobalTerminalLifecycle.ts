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
	workspaceId?: string;
}

interface TerminalLocation {
	ownerWorkspaceId: string;
	sessionWorkspaceId: string;
}

interface RemovedTerminalLocation {
	terminalId: string;
	ownerWorkspaceId: string;
	sessionWorkspaceId: string;
}

interface PendingTerminalCleanup {
	ownerWorkspaceId: string;
	sessionWorkspaceId: string;
	timer: ReturnType<typeof setTimeout> | null;
}

interface PendingTerminalInstanceRelease {
	terminalId: string;
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

function getTerminalSessionWorkspaceId(
	pane: WorkspaceState<unknown>["tabs"][number]["panes"][string],
	fallbackWorkspaceId: string,
): string {
	if (!pane.data || typeof pane.data !== "object") return fallbackWorkspaceId;
	const data = pane.data as Partial<TerminalPaneData>;
	return typeof data.workspaceId === "string"
		? data.workspaceId
		: fallbackWorkspaceId;
}

function getTerminalInstanceKey(
	pane: WorkspaceState<unknown>["tabs"][number]["panes"][string],
): string | null {
	const terminalId = getTerminalId(pane);
	return terminalId ? `${terminalId}\u0000${pane.id}` : null;
}

function parseTerminalInstanceKey(
	key: string,
): { terminalId: string; instanceId: string } | null {
	const separatorIndex = key.indexOf("\u0000");
	if (separatorIndex === -1) return null;
	return {
		terminalId: key.slice(0, separatorIndex),
		instanceId: key.slice(separatorIndex + 1),
	};
}

function extractTerminalLocations(
	rows: PaneLifecycleRow[],
): Map<string, TerminalLocation> {
	const locations = new Map<string, TerminalLocation>();

	for (const row of rows) {
		if (typeof row.workspaceId !== "string") continue;

		const layout = row.paneLayout as WorkspaceState<unknown> | undefined;
		if (!layout?.tabs) continue;

		for (const tab of layout.tabs) {
			for (const pane of Object.values(tab.panes)) {
				const terminalId = getTerminalId(pane);
				if (!terminalId) continue;
				locations.set(terminalId, {
					ownerWorkspaceId: row.workspaceId,
					sessionWorkspaceId: getTerminalSessionWorkspaceId(
						pane,
						row.workspaceId,
					),
				});
			}
		}
	}

	return locations;
}

function extractTerminalInstanceLocations(
	rows: PaneLifecycleRow[],
): Map<string, string> {
	return extractPaneLocations(rows, getTerminalInstanceKey);
}

function getRemovedTerminalLocations({
	previousLocations,
	currentLocations,
	currentWorkspaceIds,
}: {
	previousLocations: Map<string, TerminalLocation>;
	currentLocations: Map<string, TerminalLocation>;
	currentWorkspaceIds: Set<string>;
}): RemovedTerminalLocation[] {
	const removed: RemovedTerminalLocation[] = [];

	for (const [terminalId, location] of previousLocations) {
		if (currentLocations.has(terminalId)) continue;
		if (!currentWorkspaceIds.has(location.ownerWorkspaceId)) continue;
		removed.push({ terminalId, ...location });
	}

	return removed;
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
		.terminal.killSession.mutate({ terminalId, workspaceId })
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
	const prevTerminalLocationsRef = useRef<Map<string, TerminalLocation>>(
		new Map(),
	);
	const prevTerminalInstanceLocationsRef = useRef<Map<string, string>>(
		new Map(),
	);
	const pendingCleanups = useRef<Map<string, PendingTerminalCleanup>>(
		new Map(),
	);
	const pendingInstanceReleases = useRef<
		Map<string, PendingTerminalInstanceRelease>
	>(new Map());

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
	const hostUrlByWorkspaceIdRef = useRef(hostUrlByWorkspaceId);
	hostUrlByWorkspaceIdRef.current = hostUrlByWorkspaceId;

	useEffect(() => {
		const rows = allWorkspaceRows as PaneLifecycleRow[];
		const currentTerminalLocations = extractTerminalLocations(rows);
		const currentTerminalInstanceLocations =
			extractTerminalInstanceLocations(rows);
		const currentWorkspaceIds = extractWorkspaceIds(rows);
		const prevTerminalLocations = prevTerminalLocationsRef.current;
		const prevTerminalInstanceLocations =
			prevTerminalInstanceLocationsRef.current;

		for (const terminalId of currentTerminalLocations.keys()) {
			const pending = pendingCleanups.current.get(terminalId);
			if (pending?.timer) {
				clearTimeout(pending.timer);
			}
			pendingCleanups.current.delete(terminalId);
		}

		for (const instanceKey of currentTerminalInstanceLocations.keys()) {
			const pending = pendingInstanceReleases.current.get(instanceKey);
			if (pending?.timer) {
				clearTimeout(pending.timer);
			}
			pendingInstanceReleases.current.delete(instanceKey);
		}

		// If a pane was authoritatively removed but the owner row disappeared
		// before the grace timer fired, keep waiting until that row is present
		// again. That avoids releasing active renderer state during sleep/wake
		// while still cleaning up when the post-removal layout comes back.
		for (const [terminalId, pending] of pendingCleanups.current) {
			if (pending.timer) continue;
			if (currentWorkspaceIds.has(pending.ownerWorkspaceId)) {
				pendingCleanups.current.delete(terminalId);
				cleanupRemovedTerminal({
					terminalId,
					workspaceId: pending.sessionWorkspaceId,
					hostUrlByWorkspaceId: hostUrlByWorkspaceIdRef.current,
				});
			}
		}

		for (const [instanceKey, pending] of pendingInstanceReleases.current) {
			if (pending.timer) continue;
			if (currentWorkspaceIds.has(pending.workspaceId)) {
				pendingInstanceReleases.current.delete(instanceKey);
				const parsed = parseTerminalInstanceKey(instanceKey);
				if (parsed) {
					terminalRuntimeRegistry.release(parsed.terminalId, parsed.instanceId);
				}
			}
		}

		const removedInstanceLocations = getRemovedPaneLocations({
			previousLocations: prevTerminalInstanceLocations,
			currentLocations: currentTerminalInstanceLocations,
			currentWorkspaceIds,
		});

		for (const { id: instanceKey, workspaceId } of removedInstanceLocations) {
			if (pendingInstanceReleases.current.has(instanceKey)) continue;

			const parsed = parseTerminalInstanceKey(instanceKey);
			if (!parsed) continue;

			const timer = setTimeout(() => {
				const freshRows = Array.from(
					collections.v2WorkspaceLocalState.state.values(),
				) as PaneLifecycleRow[];
				const freshInstanceLocations =
					extractTerminalInstanceLocations(freshRows);
				const freshWorkspaceIds = extractWorkspaceIds(freshRows);

				if (freshInstanceLocations.has(instanceKey)) {
					pendingInstanceReleases.current.delete(instanceKey);
					return;
				}

				if (freshWorkspaceIds.has(workspaceId)) {
					pendingInstanceReleases.current.delete(instanceKey);
					terminalRuntimeRegistry.release(parsed.terminalId, parsed.instanceId);
					return;
				}

				const pending = pendingInstanceReleases.current.get(instanceKey);
				if (pending) {
					pending.timer = null;
				}
			}, RELEASE_DELAY_MS);

			pendingInstanceReleases.current.set(instanceKey, {
				terminalId: parsed.terminalId,
				workspaceId,
				timer,
			});
		}

		const removedLocations = getRemovedTerminalLocations({
			previousLocations: prevTerminalLocations,
			currentLocations: currentTerminalLocations,
			currentWorkspaceIds,
		});

		for (const {
			terminalId,
			ownerWorkspaceId,
			sessionWorkspaceId,
		} of removedLocations) {
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

				if (freshWorkspaceIds.has(ownerWorkspaceId)) {
					pendingCleanups.current.delete(terminalId);
					cleanupRemovedTerminal({
						terminalId,
						workspaceId: sessionWorkspaceId,
						hostUrlByWorkspaceId: hostUrlByWorkspaceIdRef.current,
					});
					return;
				}

				const pending = pendingCleanups.current.get(terminalId);
				if (pending) {
					pending.timer = null;
				}
			}, RELEASE_DELAY_MS);

			pendingCleanups.current.set(terminalId, {
				ownerWorkspaceId,
				sessionWorkspaceId,
				timer,
			});
		}

		prevTerminalLocationsRef.current = currentTerminalLocations;
		prevTerminalInstanceLocationsRef.current = currentTerminalInstanceLocations;
	}, [allWorkspaceRows, collections]);

	useEffect(() => {
		return () => {
			for (const pending of pendingCleanups.current.values()) {
				if (pending.timer) {
					clearTimeout(pending.timer);
				}
			}
			pendingCleanups.current.clear();
			for (const pending of pendingInstanceReleases.current.values()) {
				if (pending.timer) {
					clearTimeout(pending.timer);
				}
			}
			pendingInstanceReleases.current.clear();
		};
	}, []);
}
