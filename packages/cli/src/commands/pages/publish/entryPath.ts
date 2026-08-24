import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

function canonical(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return path;
	}
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
