import {
	V2_NEW_USER_V1_EXPERIMENT_START,
	V2_NEW_USER_V2_DEFAULT_START,
	V2_ONLY_USER_CUTOFF,
} from "./constants";

export function isV2OnlyUser(
	createdAt: Date | string | number | null | undefined,
): boolean {
	if (createdAt == null) return false;
	const created =
		createdAt instanceof Date
			? createdAt.getTime()
			: new Date(createdAt).getTime();
	if (Number.isNaN(created)) return false;
	// Original v2-only cohort, OR new users on/after the v2-default rollout. The
	// gap between them is the new-users-v1 experiment cohort, who stay on v1.
	return (
		(created >= new Date(V2_ONLY_USER_CUTOFF).getTime() &&
			created < new Date(V2_NEW_USER_V1_EXPERIMENT_START).getTime()) ||
		created >= new Date(V2_NEW_USER_V2_DEFAULT_START).getTime()
	);
}
