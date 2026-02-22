import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { getDefaultShell } from "../terminal/env";

/**
 * Finds all paths for a binary on Unix systems using the login shell.
 */
function findBinaryPathsUnix(name: string): string[] {
	const shell = getDefaultShell();
	const result = execFileSync(
		shell,
		["-l", "-c", 'which -a -- "$1"', "superset-find-binary", name],
		{
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "ignore"],
		},
	);
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
 * Filters out all superset bin directories (prod, dev, and workspace-specific)
 * to avoid wrapper scripts calling each other.
 */
export function findRealBinary(name: string): string | null {
	try {
		const isWindows = process.platform === "win32";
		const allPaths = isWindows
			? findBinaryPathsWindows(name)
			: findBinaryPathsUnix(name);

		const homedir = os.homedir();
		// Filter out wrapper scripts from all superset directories:
		// - ~/.superset/bin
		// - ~/.superset-*/bin (workspace-specific instances)
		const supersetBinDir = path.join(homedir, ".superset", "bin");
		const supersetPrefix = path.join(homedir, ".superset-");
		const paths = allPaths.filter(
			(p) =>
				p &&
				!p.startsWith(supersetBinDir) &&
				!(p.startsWith(supersetPrefix) && p.includes("/bin/")),
		);
		return paths[0] || null;
	} catch {
		return null;
	}
}
