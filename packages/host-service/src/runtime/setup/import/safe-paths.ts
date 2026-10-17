import { lstatSync, realpathSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { getImportedScriptPath } from "./plan";
import { IMPORTED_SCRIPT_KEYS, type SetupImportCandidate } from "./types";

const SUPERSET_DIR = ".superset";
const CONFIG_FILE = ".superset/config.json";

/** True for anything at the path, a dangling symlink included. */
export function pathExistsNoFollow(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch {
		return false;
	}
}

function isSymlink(path: string): boolean {
	try {
		return lstatSync(path).isSymbolicLink();
	} catch {
		return false;
	}
}

function isInside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== "..");
}

/** The repo-relative paths an import of this candidate writes or deletes. */
export function getImportDestinations(
	candidate: SetupImportCandidate,
): string[] {
	const destinations = [SUPERSET_DIR, CONFIG_FILE];
	for (const key of IMPORTED_SCRIPT_KEYS) {
		if (candidate.scripts[key]) destinations.push(getImportedScriptPath(key));
	}
	return destinations;
}

/**
 * Destinations the import must not write through: a symlink (dangling or
 * not), or a path whose real parent directory leaves the project root.
 */
export function findUnsafeImportPaths(
	repoPath: string,
	candidate: SetupImportCandidate,
): string[] {
	let realRoot: string;
	try {
		realRoot = realpathSync(repoPath);
	} catch {
		// Without a resolvable root nothing can be proven inside it.
		return getImportDestinations(candidate);
	}
	return getImportDestinations(candidate).filter((relativePath) => {
		const absolutePath = join(repoPath, relativePath);
		if (isSymlink(absolutePath)) return true;
		const parent = dirname(absolutePath);
		if (!pathExistsNoFollow(parent)) return false;
		try {
			return !isInside(realRoot, realpathSync(parent));
		} catch {
			return true;
		}
	});
}
