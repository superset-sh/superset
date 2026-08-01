import { useEffect } from "react";
import type { HostWorkspaceItem } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/**
 * Workspaces deleted while this renderer wasn't looking (CLI, another
 * machine, a crashed session) never hit the explicit delete-path cleanup,
 * so their v2-workspace-local-state rows leak forever — an audited
 * long-lived profile had 52 of 102 rows pointing at dead workspaces.
 * Skipping rows younger than the grace keeps in-flight creates (seeded
 * locally before any host lists them) out of reach.
 */
const CREATE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const reconciledOrgs = new Set<string>();
const reconcilingOrgs = new Set<string>();

/** Structural subset of the v2WorkspaceLocalState collection the GC needs. */
export interface WorkspaceLocalStateCollectionLike {
	state: ReadonlyMap<string, { createdAt: Date | string }>;
	delete: (workspaceId: string) => void;
}

export function reconcileStaleWorkspaceState(
	localState: WorkspaceLocalStateCollectionLike,
	liveWorkspaceIds: ReadonlySet<string>,
	now: number = Date.now(),
): number {
	const doomed: string[] = [];
	for (const [workspaceId, row] of localState.state) {
		if (liveWorkspaceIds.has(workspaceId)) continue;
		const createdAt =
			row.createdAt instanceof Date
				? row.createdAt.getTime()
				: Date.parse(row.createdAt);
		const age = now - createdAt;
		// Rows with an unparseable createdAt predate the schema default and
		// can't be in-flight creates — treat them as past the grace. Future
		// timestamps are not allowed to extend the grace indefinitely.
		if (Number.isFinite(age) && age >= 0 && age < CREATE_GRACE_MS) {
			continue;
		}
		doomed.push(workspaceId);
	}
	for (const workspaceId of doomed) {
		localState.delete(workspaceId);
	}
	return doomed.length;
}

/**
 * One reconcile pass per org per session, and only from an authoritative
 * workspace list — `isAuthoritative` (not `isReady`) requires a settled live
 * response from every host. Snapshots still render offline, but their age and
 * completeness are unknown, so they must never authorize deletion.
 */
export function useReconcileStaleWorkspaceState(
	workspaces: HostWorkspaceItem[],
	isAuthoritative: boolean,
): void {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId;

	useEffect(() => {
		if (!isAuthoritative || !organizationId) return;
		if (
			reconciledOrgs.has(organizationId) ||
			reconcilingOrgs.has(organizationId)
		) {
			return;
		}
		reconcilingOrgs.add(organizationId);

		const liveIds = new Set(workspaces.map((workspace) => workspace.id));
		void collections.v2WorkspaceLocalState
			.preload()
			.then(() => {
				reconcileStaleWorkspaceState(
					collections.v2WorkspaceLocalState,
					liveIds,
				);
				reconciledOrgs.add(organizationId);
			})
			.catch((error) => {
				console.warn(
					"[workspace-local-state-gc] Reconciliation failed; remains eligible for retry",
					error,
				);
			})
			.finally(() => {
				reconcilingOrgs.delete(organizationId);
			});
	}, [isAuthoritative, organizationId, workspaces, collections]);
}
