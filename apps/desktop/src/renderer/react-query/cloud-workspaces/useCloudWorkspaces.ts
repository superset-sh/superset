import type { SelectCloudWorkspace } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/**
 * Hook to get all cloud workspaces for the current organization.
 * Uses Electric SQL for real-time sync via useLiveQuery.
 */
export function useCloudWorkspaces() {
	const collections = useCollections();

	const { data, isLoading } = useLiveQuery(
		(q) => q.from({ cloudWorkspaces: collections.cloudWorkspaces }),
		[collections],
	);

	const cloudWorkspaces: SelectCloudWorkspace[] = data ?? [];

	return {
		cloudWorkspaces,
		isLoading,
	};
}

/**
 * Hook to get a single cloud workspace by ID.
 */
export function useCloudWorkspace(workspaceId: string | undefined) {
	const collections = useCollections();

	const { data: cloudWorkspaces, isLoading } = useLiveQuery(
		(q) => q.from({ cloudWorkspaces: collections.cloudWorkspaces }),
		[collections],
	);

	const cloudWorkspace = useMemo(() => {
		if (!cloudWorkspaces || !workspaceId) return null;
		return cloudWorkspaces.find((w) => w.id === workspaceId) ?? null;
	}, [cloudWorkspaces, workspaceId]);

	return {
		cloudWorkspace,
		isLoading,
	};
}

/**
 * Hook to get cloud workspaces grouped by status.
 */
export function useCloudWorkspacesByStatus() {
	const { cloudWorkspaces, isLoading } = useCloudWorkspaces();

	const grouped = useMemo(() => {
		const running: SelectCloudWorkspace[] = [];
		const paused: SelectCloudWorkspace[] = [];
		const stopped: SelectCloudWorkspace[] = [];
		const other: SelectCloudWorkspace[] = [];

		for (const workspace of cloudWorkspaces) {
			switch (workspace.status) {
				case "running":
					running.push(workspace);
					break;
				case "paused":
					paused.push(workspace);
					break;
				case "stopped":
					stopped.push(workspace);
					break;
				default:
					other.push(workspace);
			}
		}

		return { running, paused, stopped, other };
	}, [cloudWorkspaces]);

	return {
		...grouped,
		all: cloudWorkspaces,
		isLoading,
	};
}
