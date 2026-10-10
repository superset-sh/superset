import { closeSync, lstatSync, openSync, statSync } from "node:fs";

export type PathState = "missing" | "directory" | "file" | "inaccessible";

const PERMISSION_CODES = new Set(["EACCES", "EPERM"]);
const UNRESOLVABLE_CODES = new Set([
	"ENOENT",
	"ENOTDIR",
	"ELOOP",
	"ENAMETOOLONG",
]);
// "Permission denied (publickey)" is an SSH auth failure, not a file one.
const PERMISSION_MESSAGE_PATTERN =
	/operation not permitted|: permission denied(?! \()/i;

function errnoCode(error: unknown): string | undefined {
	return (error as NodeJS.ErrnoException | null)?.code;
}

function statState(path: string, followSymlinks: boolean): PathState {
	try {
		const stats = (followSymlinks ? statSync : lstatSync)(path, {
			throwIfNoEntry: false,
		});
		if (!stats) return "missing";
		return stats.isDirectory() ? "directory" : "file";
	} catch (err) {
		const code = errnoCode(err);
		if (code && PERMISSION_CODES.has(code)) return "inaccessible";
		if (code && UNRESOLVABLE_CODES.has(code)) return "missing";
		throw err;
	}
}

/** Unlike `existsSync`, keeps a path this process may not read apart from one
 * that is absent. macOS privacy controls (e.g. on Google Drive) allow `stat`
 * but refuse reads, so a directory is also opened to check it. */
export function getPathState(
	path: string,
	{ followSymlinks = true }: { followSymlinks?: boolean } = {},
): PathState {
	const state = statState(path, followSymlinks);
	if (state !== "directory") return state;
	try {
		closeSync(openSync(path, "r"));
	} catch (err) {
		const code = errnoCode(err);
		if (code && PERMISSION_CODES.has(code)) return "inaccessible";
	}
	return "directory";
}

export function isMissingPath(
	path: string,
	{ followSymlinks = true }: { followSymlinks?: boolean } = {},
): boolean {
	return statState(path, followSymlinks) === "missing";
}

/** True when `path` exists but this process may not open it. */
export function isUnreadable(path: string): boolean {
	try {
		closeSync(openSync(path, "r"));
		return false;
	} catch (err) {
		return isPermissionDenied(err);
	}
}

/** True for an fs error on a path, or a git or spawn failure, caused by
 * missing read permission. Follows `cause` chains. */
export function isPermissionDenied(error: unknown): boolean {
	for (let e = error; e; e = (e as { cause?: unknown }).cause) {
		if (fsPermissionErrorPath(e)) return true;
		if (e instanceof Error && PERMISSION_MESSAGE_PATTERN.test(e.message)) {
			return true;
		}
		if (!(e instanceof Error)) break;
	}
	return false;
}

// A spawn error's `path` is the command, not the folder that was refused.
function fsPermissionErrorPath(error: unknown): string | undefined {
	const e = error as NodeJS.ErrnoException | null;
	if (!e?.code || !PERMISSION_CODES.has(e.code)) return undefined;
	if (typeof e.path !== "string" || e.syscall?.startsWith("spawn")) {
		return undefined;
	}
	return e.path;
}

/** The path an fs permission error names, when it has one. */
export function permissionDeniedPath(error: unknown): string | undefined {
	for (let e = error; e instanceof Error; e = e.cause) {
		const path = fsPermissionErrorPath(e);
		if (path) return path;
	}
	return undefined;
}

export function inaccessiblePathMessage(path?: string): string {
	const hint =
		process.platform === "darwin"
			? " Allow Superset to access this location in System Settings > Privacy & Security > Files & Folders, then restart Superset."
			: "";
	const subject = path ?? "a folder this action needs";
	return `Superset does not have permission to read ${subject}.${hint}`;
}
