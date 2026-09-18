import type { SubmitOutcome } from "./useWorkspaceCreates";

/**
 * The error a caller must report itself, or `null` when the store already
 * reported it.
 *
 * A create that fails before it produces a workspace is recorded as a
 * failed-create row, and the user gets the full-screen "Couldn't create
 * workspace" card carrying the same text. A create whose workspace survives an
 * agent that never launched has no such row — `workspaceId` on the failure arm
 * is what distinguishes the two — so the caller's toast is that error's only
 * channel.
 */
export function reportableAgentLaunchError(
	outcome: SubmitOutcome,
): string | null {
	if (outcome.ok) return null;
	if (outcome.workspaceId === undefined) return null;
	return outcome.error;
}
