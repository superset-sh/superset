import type { ShareGrantee, ShareGranteeRef } from "@superset/shared/sharing";

export const granteeRefOf = (grantee: ShareGrantee): ShareGranteeRef =>
	grantee.kind === "user"
		? { kind: "user", userId: grantee.userId }
		: grantee.kind === "team"
			? { kind: "team", teamId: grantee.teamId }
			: { kind: "invitation", invitationId: grantee.invitationId };

/** A grantee as one route param, `kind:id`. */
export const granteeKey = (ref: ShareGranteeRef): string =>
	ref.kind === "user"
		? `user:${ref.userId}`
		: ref.kind === "team"
			? `team:${ref.teamId}`
			: `invitation:${ref.invitationId}`;

export const findGrantee = (
	grantees: ShareGrantee[],
	key: string | undefined,
): ShareGrantee | undefined =>
	grantees.find((grantee) => granteeKey(granteeRefOf(grantee)) === key);
