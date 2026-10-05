/**
 * The ref namespace a teleport parks its capture under.
 *
 * `refs/superset/…` sits outside `refs/heads` and `refs/tags`, so a capture
 * never shows up as a branch, never reaches a remote through a default
 * push refspec, and cannot collide with a user's own refs.
 */
const NAMESPACE = "refs/superset/teleport";

/** Ids come from the workspace row, so a retry reuses the same ref. */
export function handoffRef(workspaceId: string): string {
	if (!/^[\w-]+$/.test(workspaceId)) {
		throw new Error(`Unsafe workspace id for a teleport ref: ${workspaceId}`);
	}
	return `${NAMESPACE}/${workspaceId}`;
}

export function isHandoffRef(ref: string): boolean {
	return ref.startsWith(`${NAMESPACE}/`);
}
