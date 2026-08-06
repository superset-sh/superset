/**
 * Pure derivation of whether the v2 cloud dashboard is active for a user.
 *
 * `optInV2` is the renderer-local override persisted in localStorage
 * (zustand key `v2-local-override-v2`):
 *   - `true`  → user explicitly opted in
 *   - `false` → user explicitly opted out (always wins)
 *   - `null`  → no local preference recorded (fresh install OR localStorage lost)
 *
 * When there is no local preference we fall back to `isV2OnlyUser || isDev`.
 *
 * KNOWN LIMITATION (see issue #5498): a pre-cutoff user who opted in has
 * their only source of truth in localStorage. If that storage is wiped
 * (quota-recovery wipe, profile corruption, moving machines) `optInV2`
 * reverts to `null` and this function silently returns `false`, dropping the
 * user back to the legacy v1 dashboard with no indication anything changed.
 * The UI compensates by surfacing a legacy-dashboard banner (see
 * `V2AvailableBanner`) whenever this derivation is false for a pre-cutoff
 * account.
 */
export function deriveIsV2CloudEnabled(params: {
	optInV2: boolean | null;
	isV2OnlyUser: boolean;
	isDev: boolean;
}): boolean {
	const { optInV2, isV2OnlyUser, isDev } = params;
	return optInV2 ?? (isV2OnlyUser || isDev);
}
