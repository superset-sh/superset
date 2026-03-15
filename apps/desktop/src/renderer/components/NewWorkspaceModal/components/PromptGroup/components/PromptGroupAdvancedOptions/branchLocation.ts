/**
 * Derives a human-readable location label for a branch based on its
 * local/remote presence. Used in the base-branch picker to help users
 * distinguish between local-only, remote-only, and synced branches.
 */
export function getBranchLocationLabel(branch: {
	isLocal: boolean;
	isRemote: boolean;
}): "local" | "remote" | null {
	if (branch.isLocal && branch.isRemote) return null; // both — no badge needed
	if (branch.isLocal) return "local";
	if (branch.isRemote) return "remote";
	return null;
}
