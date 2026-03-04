import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDefaultShell } from "../terminal/env";

/**
 * Finds all paths for a binary on Unix systems using the login shell.
 */
function findBinaryPathsUnix(name: string): string[] {
	const shell = getDefaultShell();
	const delimiter = "__SUPERSET_WHICH_DELIMITER__";
	const result = execFileSync(
		shell,
		[
			"-il",
			"-c",
			`echo -n "${delimiter}"; which -a -- "$1"; echo -n "${delimiter}"`,
			"superset-find-binary",
			name,
		],
		{
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "ignore"],
		},
	);

	const sections = result.split(delimiter);
	const output = sections.length >= 3 ? sections[1] : result;

	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith("/"))
		.filter(isExecutableUnixPath);
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
				!(p.startsWith(supersetPrefix) && p.includes("/bin/")) &&
				(isWindows || isExecutableUnixPath(p)),
		);
		return paths[0] || null;
	} catch {
		return null;
	}
}

function isExecutableUnixPath(candidate: string): boolean {
	if (!path.isAbsolute(candidate) || !existsSync(candidate)) {
		return false;
	}

	try {
		const stat = statSync(candidate);
		if (!stat.isFile()) {
			return false;
		}
		accessSync(candidate, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
