import { toast } from "@superset/ui/sonner";
import { useEffect, useMemo, useRef } from "react";
import { trpc } from "renderer/lib/trpc";
import { usePortsStore } from "renderer/stores";
import type { MergedPort } from "shared/types";
import { mergePorts } from "../utils";

export interface MergedWorkspaceGroup {
	workspaceId: string;
	workspaceName: string;
	isCurrentWorkspace: boolean;
	ports: MergedPort[];
}

export function usePortsData() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: allWorkspaces } = trpc.workspaces.getAll.useQuery();
	const ports = usePortsStore((s) => s.ports);
	const setPorts = usePortsStore((s) => s.setPorts);
	const addPort = usePortsStore((s) => s.addPort);
	const removePort = usePortsStore((s) => s.removePort);

	const utils = trpc.useUtils();

	const { data: allStaticPortsData } = trpc.ports.getAllStatic.useQuery();

	trpc.ports.subscribeStatic.useSubscription(
		{ workspaceId: activeWorkspace?.id ?? "" },
		{
			enabled: !!activeWorkspace?.id,
			onData: () => {
				utils.ports.getAllStatic.invalidate();
			},
		},
	);

	const { data: initialPorts } = trpc.ports.getAll.useQuery();

	useEffect(() => {
		if (initialPorts) {
			setPorts(initialPorts);
		}
	}, [initialPorts, setPorts]);

	trpc.ports.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "add") {
				addPort(event.port);
			} else if (event.type === "remove") {
				removePort(event.port.paneId, event.port.port);
			}
		},
	});

	const workspaceNames = useMemo(() => {
		if (!allWorkspaces) return {};
		return allWorkspaces.reduce(
			(acc, ws) => {
				acc[ws.id] = ws.name;
				return acc;
			},
			{} as Record<string, string>,
		);
	}, [allWorkspaces]);

	// Prevent showing duplicate error toasts on re-renders
	const shownErrorsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		const errors = allStaticPortsData?.errors ?? [];
		for (const { workspaceId, error } of errors) {
			const errorKey = `${workspaceId}:${error}`;
			if (!shownErrorsRef.current.has(errorKey)) {
				shownErrorsRef.current.add(errorKey);
				const workspaceName =
					workspaceNames[workspaceId] || "Unknown workspace";
				toast.error(`Failed to load ports.json in ${workspaceName}`, {
					description: error,
				});
			}
		}
	}, [allStaticPortsData?.errors, workspaceNames]);

	const allWorkspaceIds = useMemo(() => {
		const ids = new Set<string>();

		for (const port of allStaticPortsData?.ports ?? []) {
			ids.add(port.workspaceId);
		}

		for (const port of ports) {
			ids.add(port.workspaceId);
		}

		return Array.from(ids);
	}, [allStaticPortsData?.ports, ports]);

	const workspacePortGroups = useMemo(() => {
		const allStaticPorts = allStaticPortsData?.ports ?? [];

		const groups: MergedWorkspaceGroup[] = allWorkspaceIds.map(
			(workspaceId) => {
				const staticPortsForWorkspace = allStaticPorts.filter(
					(p) => p.workspaceId === workspaceId,
				);

				const merged = mergePorts({
					staticPorts: staticPortsForWorkspace,
					dynamicPorts: ports,
					workspaceId,
				});

				return {
					workspaceId,
					workspaceName: workspaceNames[workspaceId] || "Unknown",
					isCurrentWorkspace: workspaceId === activeWorkspace?.id,
					ports: merged,
				};
			},
		);

		groups.sort((a, b) => {
			if (a.isCurrentWorkspace && !b.isCurrentWorkspace) return -1;
			if (!a.isCurrentWorkspace && b.isCurrentWorkspace) return 1;
			return a.workspaceName.localeCompare(b.workspaceName);
		});

		return groups;
	}, [
		allWorkspaceIds,
		allStaticPortsData?.ports,
		ports,
		workspaceNames,
		activeWorkspace?.id,
	]);

	const totalPortCount = workspacePortGroups.reduce(
		(sum, g) => sum + g.ports.length,
		0,
	);

	return {
		workspacePortGroups,
		totalPortCount,
	};
}
