import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	buildWorkspaceNames,
	buildWorkspacePortGroups,
	type WorkspacePortGroup,
} from "./buildWorkspacePortGroups";

export type { WorkspacePortGroup };

const PORTS_FALLBACK_REFETCH_INTERVAL_MS = 10_000;

export function usePortsData() {
	const { data: allWorkspaces } = electronTrpc.workspaces.getAll.useQuery();

	const utils = electronTrpc.useUtils();

	const { data: detectedPorts } = electronTrpc.ports.getAll.useQuery(
		undefined,
		{
			// Keep a low-frequency safety net in case subscription events are missed.
			refetchInterval: PORTS_FALLBACK_REFETCH_INTERVAL_MS,
		},
	);

	electronTrpc.ports.subscribe.useSubscription(undefined, {
		onData: () => {
			utils.ports.getAll.invalidate();
		},
	});

	const ports = detectedPorts ?? [];

	const workspaceNames = useMemo(
		() => buildWorkspaceNames(allWorkspaces),
		[allWorkspaces],
	);

	const workspacePortGroups = useMemo(
		() => buildWorkspacePortGroups(ports, workspaceNames),
		[ports, workspaceNames],
	);

	const totalPortCount = workspacePortGroups.reduce(
		(sum, g) => sum + g.ports.length,
		0,
	);

	return {
		workspacePortGroups,
		totalPortCount,
	};
}
