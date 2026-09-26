export type WindowOrgResolution =
	| { kind: "wait" }
	| { kind: "unresolvable" }
	| { kind: "resolved"; organizationId: string };

export interface ResolveWindowOrgInput {
	windowOrgPending: boolean;
	windowOrgId: string | null | undefined;
	organizations: { id: string }[] | undefined;
	organizationsErrored: boolean;
	sessionOrgId: string | null | undefined;
}

// The registry's org is only preferred while it is still one the user belongs
// to. Leaving an organization (or having membership revoked elsewhere) leaves
// a dead id in the registry, and adopting it would pin the window to an org
// whose every read now fails. Until the membership list has loaded we cannot
// tell stale from valid, so wait rather than guess. If the list failed to load
// the window is unresolvable, never "resolved" against an unverified id: a
// transient failure would otherwise pin the window permanently.
export function resolveWindowOrg({
	windowOrgPending,
	windowOrgId,
	organizations,
	organizationsErrored,
	sessionOrgId,
}: ResolveWindowOrgInput): WindowOrgResolution {
	if (windowOrgPending) return { kind: "wait" };
	if (windowOrgId != null && organizations == null) {
		return organizationsErrored ? { kind: "unresolvable" } : { kind: "wait" };
	}
	const registryOrgIsStillMine =
		windowOrgId != null &&
		organizations != null &&
		organizations.some((organization) => organization.id === windowOrgId);
	const resolved =
		(registryOrgIsStillMine ? windowOrgId : sessionOrgId) ?? null;
	if (!resolved) return { kind: "wait" };
	return { kind: "resolved", organizationId: resolved };
}
