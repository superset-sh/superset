import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { SUPERSET_DIR_NAMES } from "shared/constants";
import { getDefaultShell } from "../terminal/env";

/**
 * Finds the real path of a binary, skipping our wrapper scripts.
 * Filters out both dev and prod superset bin directories
 * to avoid wrapper scripts calling each other.
 */
export function findRealBinary(name: string): string | null {
	try {
		// Use login shell (-l) to source user's profile and get full PATH. Avoid not having paths in prod.
		const shell = getDefaultShell();
		const result = execSync(`${shell} -l -c "which -a ${name}" 2>/dev/null`, {
			encoding: "utf-8",
		});

		const homedir = os.homedir();
		const supersetBinDirs = [
			path.join(homedir, SUPERSET_DIR_NAMES.PROD, "bin"),
			path.join(homedir, SUPERSET_DIR_NAMES.DEV, "bin"),
		];
		const paths = result
			.trim()
			.split("\n")
			.filter((p) => p && !supersetBinDirs.some((dir) => p.startsWith(dir)));
		return paths[0] || null;
	} catch {
		return null;
	}
}
