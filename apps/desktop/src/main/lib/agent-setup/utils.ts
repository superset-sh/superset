import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { SUPERSET_DIR_NAMES } from "shared/constants";
import { getDefaultShell } from "../terminal/env";

/**
 * Finds all paths for a binary on Unix systems using the login shell.
 */
function findBinaryPathsUnix(name: string): string[] {
	const shell = getDefaultShell();
	const result = execFileSync(shell, ["-l", "-c", `which -a ${name}`], {
		encoding: "utf-8",
		stdio: ["pipe", "pipe", "ignore"],
	});
	return result.trim().split("\n").filter(Boolean);
}

/**
 * Finds all paths for a binary on Windows using where.exe.
 */
function findBinaryPathsWindows(name: string): string[] {
	const result = execFileSync("where.exe", [name], {
		encoding: "utf-8",
		stdio: ["pipe", "pipe", "ignore"],
	});
	return result.trim().split("\r\n").filter(Boolean);
}

/**
 * Finds the real path of a binary, skipping our wrapper scripts.
 * Filters out both dev and prod superset bin directories
 * to avoid wrapper scripts calling each other.
 */
export function findRealBinary(name: string): string | null {
	try {
		const isWindows = process.platform === "win32";
		const allPaths = isWindows
			? findBinaryPathsWindows(name)
			: findBinaryPathsUnix(name);

		const homedir = os.homedir();
		const supersetBinDirs = [
			path.join(homedir, SUPERSET_DIR_NAMES.PROD, "bin"),
			path.join(homedir, SUPERSET_DIR_NAMES.DEV, "bin"),
		];
		const paths = allPaths.filter(
			(p) => p && !supersetBinDirs.some((dir) => p.startsWith(dir)),
		);
		return paths[0] || null;
	} catch {
		return null;
	}
}
