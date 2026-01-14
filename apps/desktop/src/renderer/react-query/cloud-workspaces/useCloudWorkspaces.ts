import type { SelectCloudWorkspace } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/**
 * Query cloud workspaces for the current organization from Electric SQL collection
 */
export function useCloudWorkspaces(): SelectCloudWorkspace[] {
	const collections = useCollections();
	const { data } = useLiveQuery((q) =>
		q
			.from({ cloudWorkspaces: collections.cloudWorkspaces })
			.select(({ cloudWorkspaces }) => cloudWorkspaces),
	);
	return data ?? [];
}

/**
 * Get a single cloud workspace by ID
 */
export function useCloudWorkspace(
	workspaceId: string | null | undefined,
): SelectCloudWorkspace | null {
	const cloudWorkspaces = useCloudWorkspaces();

	if (!workspaceId) return null;

	return cloudWorkspaces.find((ws) => ws.id === workspaceId) ?? null;
}

/**
 * Get cloud workspaces grouped by status
 */
export function useCloudWorkspacesByStatus() {
	const cloudWorkspaces = useCloudWorkspaces();

	const running = cloudWorkspaces.filter((ws) => ws.status === "running");
	const paused = cloudWorkspaces.filter((ws) => ws.status === "paused");
	const stopped = cloudWorkspaces.filter((ws) => ws.status === "stopped");
	const provisioning = cloudWorkspaces.filter(
		(ws) => ws.status === "provisioning",
	);
	const error = cloudWorkspaces.filter((ws) => ws.status === "error");

	return { running, paused, stopped, provisioning, error, all: cloudWorkspaces };
}

export type CloudWorkspace = SelectCloudWorkspace;
