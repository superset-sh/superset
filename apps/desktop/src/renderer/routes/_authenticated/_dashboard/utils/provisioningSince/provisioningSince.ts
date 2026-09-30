/**
 * When this session first saw each workspace provisioning. An unarchive
 * provisions long after `createdAt`, so the wait is timed from here.
 */
const seenAt = new Map<string, number>();

export function provisioningSince(workspaceId: string): number {
	const seen = seenAt.get(workspaceId);
	if (seen !== undefined) return seen;
	const now = Date.now();
	seenAt.set(workspaceId, now);
	return now;
}

export function restartProvisioningTimer(workspaceId: string): void {
	seenAt.delete(workspaceId);
}
