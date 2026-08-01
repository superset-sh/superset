import { useEffect, useRef } from "react";
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
const RECONCILE_ATTEMPTS = 2;

/** Structural subset of the v2WorkspaceLocalState collection the GC needs. */
export interface WorkspaceLocalStateCollectionLike {
	state: ReadonlyMap<string, { createdAt: Date | string }>;
	delete: (workspaceId: string) => void;
}

type ReconciliationWorkspace = Pick<
	HostWorkspaceItem,
	"hostReachable" | "id" | "source"
>;

/** Cloud/snapshot fallbacks render stale data but cannot prove an ID is live. */
export function getAuthoritativeWorkspaceIds(
	workspaces: readonly ReconciliationWorkspace[],
): Set<string> {
	return new Set(
		workspaces
			.filter(
				(workspace) => workspace.source === "host" && workspace.hostReachable,
			)
			.map((workspace) => workspace.id),
	);
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
		// can't be in-flight creates — treat them as past the grace. A timestamp
		// within one grace window in the future is plausible clock skew; farther
		// future timestamps cannot extend the grace indefinitely.
		if (Number.isFinite(age) && Math.abs(age) < CREATE_GRACE_MS) {
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
	const localState = collections.v2WorkspaceLocalState;
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId;
	const latestInput = useRef({ organizationId, isAuthoritative, workspaces });
	const reconciledOrgs = useRef(new Set<string>());
	const reconcileRuns = useRef(new Map<string, symbol>());
	latestInput.current = { organizationId, isAuthoritative, workspaces };

	useEffect(() => {
		if (!isAuthoritative || !organizationId) return;
		if (
			reconciledOrgs.current.has(organizationId) ||
			reconcileRuns.current.has(organizationId)
		) {
			return;
		}
		const run = Symbol(organizationId);
		reconcileRuns.current.set(organizationId, run);
		let cancelled = false;

		void (async () => {
			for (let attempt = 1; attempt <= RECONCILE_ATTEMPTS; attempt += 1) {
				try {
					await localState.preload();
					if (cancelled) return;
					const latest = latestInput.current;
					if (
						latest.organizationId !== organizationId ||
						!latest.isAuthoritative
					) {
						return;
					}
					reconcileStaleWorkspaceState(
						localState,
						getAuthoritativeWorkspaceIds(latest.workspaces),
					);
					reconciledOrgs.current.add(organizationId);
					return;
				} catch (error) {
					if (cancelled) return;
					const latest = latestInput.current;
					const canRetry =
						attempt < RECONCILE_ATTEMPTS &&
						latest.organizationId === organizationId &&
						latest.isAuthoritative;
					if (canRetry) continue;
					console.warn(
						`[workspace-local-state-gc] Reconciliation failed for organization ${organizationId} after ${attempt} attempts; deferred until the next eligibility change or session`,
						error,
					);
					return;
				}
			}
		})().finally(() => {
			if (reconcileRuns.current.get(organizationId) === run) {
				reconcileRuns.current.delete(organizationId);
			}
		});

		return () => {
			cancelled = true;
			if (reconcileRuns.current.get(organizationId) === run) {
				reconcileRuns.current.delete(organizationId);
			}
		};
	}, [isAuthoritative, organizationId, localState]);
}
