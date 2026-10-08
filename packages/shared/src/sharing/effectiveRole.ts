import type { ShareGrantee, ShareRoleOption, ShareTeam } from "./types";

/**
 * The strongest role a person gets from somewhere other than their own share
 * (a team that was shared, or general access), when it beats their own.
 * Roles rank by their order in `roles`, weakest first.
 */
export function effectiveRole({
	userId,
	ownRole,
	grantees,
	teams,
	roles,
	general,
}: {
	userId: string;
	ownRole: string | null;
	grantees: ShareGrantee[];
	teams: ShareTeam[];
	roles: ShareRoleOption[];
	general: { role: string; label: string } | null;
}): { role: string; via: string } | null {
	const rank = (role: string | null) =>
		role === null ? -1 : roles.findIndex((option) => option.id === role);

	const sources: { role: string; via: string }[] = [];
	for (const grantee of grantees) {
		if (grantee.kind !== "team" || grantee.role === null) continue;
		const team = teams.find((t) => t.teamId === grantee.teamId);
		if (team?.memberIds.includes(userId)) {
			sources.push({ role: grantee.role, via: grantee.name });
		}
	}
	if (general) sources.push({ role: general.role, via: general.label });

	const best = sources.reduce<{ role: string; via: string } | null>(
		(top, source) =>
			top && rank(top.role) >= rank(source.role) ? top : source,
		null,
	);
	return best && rank(best.role) > rank(ownRole) ? best : null;
}
