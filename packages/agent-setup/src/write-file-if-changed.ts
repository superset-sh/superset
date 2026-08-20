import fs from "node:fs";

/**
 * Idempotent, atomic file write. Skips the write when content is unchanged
 * (callers rely on this to keep re-provisioning from churning mtimes), and
 * writes via temp-file + rename otherwise. Atomicity matters because several
 * provisioners can run concurrently on one machine (the desktop plus one CLI
 * host-service per org), and some targets are user-owned configs
 * (~/.claude/settings.json) where a torn write would break the user's agent
 * until they repair it by hand — the managed-hooks merge skips unparseable
 * files rather than rewriting them.
 */
export function writeFileIfChanged(
	filePath: string,
	content: string,
	mode: number,
): boolean {
	const existing = fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf-8")
		: null;
	if (existing === content) {
		try {
			fs.chmodSync(filePath, mode);
		} catch {
			// Best effort.
		}
		return false;
	}

	const tmpPath = `${filePath}.${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmpPath, content, { mode });
		fs.renameSync(tmpPath, filePath);
	} catch (error) {
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			// Best effort.
		}
		throw error;
	}
	try {
		fs.chmodSync(filePath, mode);
	} catch {
		// Best effort.
	}
	return true;
}
