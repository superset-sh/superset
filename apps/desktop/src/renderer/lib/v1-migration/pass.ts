type V2SurfacePass = "full" | "groups-only";

/**
 * Which pass a boot on the v2 surface owes. A machine can land on v2 without
 * ever having run the v1-surface migration (account created after the v2-only
 * cutoff on an install that already held v1 data, explicit opt-in, forced
 * flip), so unmigrated v1 rows must trigger the full pass here too.
 */
export function planV2SurfacePass({
	followUpPending,
	migrationComplete,
	hasV1Data,
}: {
	followUpPending: boolean;
	migrationComplete: boolean;
	hasV1Data: boolean;
}): V2SurfacePass {
	if (followUpPending) return "full";
	if (!migrationComplete && hasV1Data) return "full";
	return "groups-only";
}
