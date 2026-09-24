import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

export function useWorkspaceConnectionRefresh(
	workspaceId: string,
	queryKey: QueryKey,
	enabled = true,
): () => void {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const refresh = useCallback(() => {
		void queryClient
			.cancelQueries({ queryKey })
			.then(() => queryClient.invalidateQueries({ queryKey }));
	}, [queryClient, queryKey]);
	const onRefresh = useEffectEvent(refresh);
	const previousTarget = useRef<{
		workspaceId: string;
		hostUrl: string;
	} | null>(null);

	useEffect(() => {
		if (!enabled || !hostUrl || !workspaceId) return;
		const previous = previousTarget.current;
		const targetChanged =
			previous?.workspaceId === workspaceId && previous.hostUrl !== hostUrl;
		previousTarget.current = { workspaceId, hostUrl };
		const bus = getHostEventBus(hostUrl);
		let state = bus.getConnectionStatus().state;
		if (state === "open" && targetChanged) onRefresh();
		const unsubscribe = bus.subscribeConnectionStatus((status) => {
			const opened = status.state === "open" && state !== "open";
			state = status.state;
			if (opened) onRefresh();
		});
		const release = bus.retain();
		return () => {
			unsubscribe();
			release();
		};
	}, [enabled, hostUrl, workspaceId]);
	return refresh;
}
