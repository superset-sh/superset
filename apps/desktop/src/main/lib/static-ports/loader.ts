import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStaticPortsConfig } from "@superset/port-scanner";
import { PORTS_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import type { StaticPortsResult } from "shared/types";

/**
 * Load and validate static ports configuration from a worktree's .superset/ports.json file.
 *
 * @param worktreePath - Path to the workspace's worktree directory
 * @returns StaticPortsResult with exists flag, ports array, and any error message
 */
export function loadStaticPorts(worktreePath: string): StaticPortsResult {
	const portsPath = join(
		worktreePath,
		PROJECT_SUPERSET_DIR_NAME,
		PORTS_FILE_NAME,
	);

	if (!existsSync(portsPath)) {
		return { exists: false, ports: null, error: null };
	}

	let content: string;
	try {
		content = readFileSync(portsPath, "utf-8");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			exists: true,
			ports: null,
			error: `Failed to read ports.json: ${message}`,
		};
	}

	const parsed = parseStaticPortsConfig(content);
	if (parsed.ports === null) {
		return { exists: true, ports: null, error: parsed.error };
	}

	return { exists: true, ports: parsed.ports, error: null };
}

/**
 * Check if a static ports configuration file exists for a worktree.
 *
 * @param worktreePath - Path to the workspace's worktree directory
 * @returns true if .superset/ports.json exists
 */
export function hasStaticPortsConfig(worktreePath: string): boolean {
	const portsPath = join(
		worktreePath,
		PROJECT_SUPERSET_DIR_NAME,
		PORTS_FILE_NAME,
	);
	return existsSync(portsPath);
}
