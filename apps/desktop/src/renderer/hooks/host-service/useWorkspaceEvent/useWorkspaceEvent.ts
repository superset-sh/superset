import {
	type GitChangedPayload,
	getEventBus,
} from "@superset/workspace-client";
import type { FsWatchEvent } from "@superset/workspace-fs/client";
import { useEffect, useEffectEvent } from "react";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

/**
 * Subscribe to an event bus event for a workspace.
 * Resolves the workspace's host and connects to the correct event bus automatically.
 */
export function useWorkspaceEvent(
	type: "git:changed",
	workspaceId: string,
	callback: (payload: GitChangedPayload) => void,
	enabled?: boolean,
): void;
export function useWorkspaceEvent(
	type: "fs:events",
	workspaceId: string,
	callback: (event: FsWatchEvent) => void,
	enabled?: boolean,
): void;
export function useWorkspaceEvent(
	type: "git:changed" | "fs:events",
	workspaceId: string,
	callback:
		| ((event: FsWatchEvent) => void)
		| ((payload: GitChangedPayload) => void),
	enabled = true,
): void {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const handler = useEffectEvent(callback);

	useEffect(() => {
		if (!enabled || !hostUrl) return;

		const bus = getEventBus(hostUrl, () => getHostServiceWsToken(hostUrl));
		const cleanups: Array<() => void> = [];

		if (type === "fs:events") {
			bus.watchFs(workspaceId);
			const removeListener = bus.on(
				"fs:events",
				workspaceId,
				(_wid, payload) => {
					for (const event of payload.events) {
						(handler as (event: FsWatchEvent) => void)(event);
					}
				},
			);
			cleanups.push(removeListener, () => bus.unwatchFs(workspaceId));
		} else {
			const removeListener = bus.on(
				"git:changed",
				workspaceId,
				(_wid, payload) => {
					(handler as (payload: GitChangedPayload) => void)(payload);
				},
			);
			cleanups.push(removeListener);
		}

		cleanups.push(bus.retain());

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	}, [enabled, hostUrl, type, workspaceId]);
}
