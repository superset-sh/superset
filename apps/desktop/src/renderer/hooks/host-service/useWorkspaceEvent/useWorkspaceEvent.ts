import type {
	AgentBindingsChangedPayload,
	AgentLifecyclePayload,
	GitChangedPayload,
	PageWatchChangedPayload,
	PortChangedPayload,
	TerminalLifecyclePayload,
} from "@superset/workspace-client";
import type { FsWatchEvent } from "@superset/workspace-fs/client";
import { useEffect, useEffectEvent } from "react";
import { getHostEventBus } from "renderer/lib/host-event-bus";
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
	type: "agent:bindings-changed",
	workspaceId: string,
	callback: (payload: AgentBindingsChangedPayload) => void,
	enabled?: boolean,
): void;
export function useWorkspaceEvent(
	type: "agent:lifecycle",
	workspaceId: string,
	callback: (payload: AgentLifecyclePayload) => void,
	enabled?: boolean,
): void;
export function useWorkspaceEvent(
	type: "terminal:lifecycle",
	workspaceId: string,
	callback: (payload: TerminalLifecyclePayload) => void,
	enabled?: boolean,
): void;
export function useWorkspaceEvent(
	type: "port:changed",
	workspaceId: string,
	callback: (payload: PortChangedPayload) => void,
	enabled?: boolean,
): void;
export function useWorkspaceEvent(
	type: "page-watch:changed",
	workspaceId: string,
	callback: (payload: PageWatchChangedPayload) => void,
	enabled?: boolean,
): void;
export function useWorkspaceEvent(
	type:
		| "git:changed"
		| "fs:events"
		| "agent:lifecycle"
		| "agent:bindings-changed"
		| "terminal:lifecycle"
		| "port:changed"
		| "page-watch:changed",
	workspaceId: string,
	callback:
		| ((event: FsWatchEvent) => void)
		| ((payload: GitChangedPayload) => void)
		| ((payload: AgentLifecyclePayload) => void)
		| ((payload: AgentBindingsChangedPayload) => void)
		| ((payload: TerminalLifecyclePayload) => void)
		| ((payload: PortChangedPayload) => void)
		| ((payload: PageWatchChangedPayload) => void),
	enabled = true,
): void {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const handler = useEffectEvent(callback);

	useEffect(() => {
		if (!enabled || !hostUrl) return;

		const bus = getHostEventBus(hostUrl);
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
		} else if (type === "agent:bindings-changed") {
			const removeListener = bus.on(
				"agent:bindings-changed",
				workspaceId,
				(_wid, payload) => {
					(handler as (payload: AgentBindingsChangedPayload) => void)(payload);
				},
			);
			cleanups.push(removeListener);
		} else if (type === "agent:lifecycle") {
			const removeListener = bus.on(
				"agent:lifecycle",
				workspaceId,
				(_wid, payload) => {
					(handler as (payload: AgentLifecyclePayload) => void)(payload);
				},
			);
			cleanups.push(removeListener);
		} else if (type === "terminal:lifecycle") {
			const removeListener = bus.on(
				"terminal:lifecycle",
				workspaceId,
				(_wid, payload) => {
					(handler as (payload: TerminalLifecyclePayload) => void)(payload);
				},
			);
			cleanups.push(removeListener);
		} else if (type === "port:changed") {
			const removeListener = bus.on(
				"port:changed",
				workspaceId,
				(_wid, payload) => {
					(handler as (payload: PortChangedPayload) => void)(payload);
				},
			);
			cleanups.push(removeListener);
		} else if (type === "page-watch:changed") {
			const removeListener = bus.on(
				"page-watch:changed",
				workspaceId,
				(_wid, payload) => {
					(handler as (payload: PageWatchChangedPayload) => void)(payload);
				},
			);
			cleanups.push(removeListener);
		} else {
			// GitWatcher only watches a workspace while someone holds interest
			// (see #6729) — watchGit/unwatchGit drive that refcount so this
			// listener actually receives events instead of silently never firing.
			bus.watchGit(workspaceId);
			const removeListener = bus.on(
				"git:changed",
				workspaceId,
				(_wid, payload) => {
					(handler as (payload: GitChangedPayload) => void)(payload);
				},
			);
			cleanups.push(removeListener, () => bus.unwatchGit(workspaceId));
		}

		cleanups.push(bus.retain());

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	}, [enabled, hostUrl, type, workspaceId]);
}
