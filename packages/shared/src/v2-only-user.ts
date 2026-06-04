import { V2_ONLY_USER_CUTOFF } from "./constants";

export function isV2OnlyUser(
	createdAt: Date | string | number | null | undefined,
): boolean {
	if (createdAt == null) return false;
	const created =
		createdAt instanceof Date
			? createdAt.getTime()
			: new Date(createdAt).getTime();
	if (Number.isNaN(created)) return false;
	return created >= new Date(V2_ONLY_USER_CUTOFF).getTime();
}
