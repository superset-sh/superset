import { realpathSync } from "node:fs";
import { basename, resolve, sep } from "node:path";

function canonical(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return path;
	}
}

/** Leading slash: a workspace-relative key never has one, so these cannot collide. */
export const EXTERNAL_ENTRY_PREFIX = "/external/";

/**
 * Basename rather than absolute path: agent scratchpad paths carry a
 * per-session UUID, so the full path mints a new page every session. The cost
 * is that two unrelated files sharing a basename version each other.
 */
export function externalEntryPath(filePath: string): string {
	return EXTERNAL_ENTRY_PREFIX + basename(filePath);
}

export function resolveEntryPath({
	filePath,
	workspacePath,
	cwd = process.cwd(),
}: {
	filePath: string;
	workspacePath: string | undefined;
	cwd?: string;
}): string | null {
	if (!workspacePath) return null;

	const absolute = canonical(resolve(cwd, filePath));
	const root = canonical(resolve(workspacePath));
	const prefix = root.endsWith(sep) ? root : root + sep;

	if (!absolute.startsWith(prefix)) return null;

	const rel = absolute.slice(prefix.length);
	if (!rel) return null;

	return process.platform === "win32" ? rel.split("\\").join("/") : rel;
}
