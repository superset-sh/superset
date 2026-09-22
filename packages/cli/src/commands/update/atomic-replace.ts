import { existsSync, renameSync, rmSync } from "node:fs";

/** Where {@link atomicReplace} parks the previous install while it swaps. */
export function backupRootFor(installRoot: string): string {
	return `${installRoot}.bak`;
}

/**
 * Swap `newRoot` into `installRoot` with a rename pair, restoring the old
 * tree if the second rename fails. With `keepBackup` the previous install
 * stays at {@link backupRootFor} so a caller that restarts a process out of
 * the new tree can roll back if that process never comes up.
 */
export function atomicReplace(
	installRoot: string,
	newRoot: string,
	options: { keepBackup?: boolean } = {},
): void {
	const backupRoot = backupRootFor(installRoot);
	if (existsSync(backupRoot)) {
		rmSync(backupRoot, { recursive: true, force: true });
	}
	if (existsSync(installRoot)) {
		renameSync(installRoot, backupRoot);
	}
	try {
		renameSync(newRoot, installRoot);
	} catch (error) {
		if (existsSync(backupRoot)) {
			renameSync(backupRoot, installRoot);
		}
		throw error;
	}
	if (!options.keepBackup) {
		rmSync(backupRoot, { recursive: true, force: true });
	}
}
