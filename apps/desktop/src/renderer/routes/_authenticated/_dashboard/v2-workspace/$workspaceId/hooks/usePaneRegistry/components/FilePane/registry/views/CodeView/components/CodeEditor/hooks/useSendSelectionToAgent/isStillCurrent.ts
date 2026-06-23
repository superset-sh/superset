/** Supersede guard (edge #5): each send() captures a monotonically-increasing
 *  dispatch token. A slow dispatch must not run its post-success cleanup once
 *  the user has started a newer send — that newer send bumps the ref, so the
 *  stale token no longer matches and its cleanup is skipped.
 *
 *  Extracted as a pure free function (the renderer has no renderHook harness)
 *  so both branches — stale token is a no-op, current token proceeds — are
 *  unit-testable without rendering the hook. Mirrors the sibling's
 *  `clearIfStillCurrent` ref-identity guard (useDiffCommentComposer.ts:102-107),
 *  swapping object identity for a numeric token because send() has no composer
 *  object to compare. */
export function isStillCurrent(token: number, currentToken: number): boolean {
	return token === currentToken;
}
