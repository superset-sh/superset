export function servedVersion(
	sharedVersion: number | null,
	latestVersion: number | null,
): number | null {
	return sharedVersion ?? latestVersion;
}

export function resolveSharedVersion(
	picked: number | null,
	latestVersion: number | null,
): number | null {
	if (picked === null) return null;
	return picked === latestVersion ? null : picked;
}
