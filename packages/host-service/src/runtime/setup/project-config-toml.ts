import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type ConfigEnvironment,
	type ConfigError,
	PROJECT_CONFIG_DIR,
	PROJECT_CONFIG_FILE,
	PROJECT_LOCAL_CONFIG_FILE,
	type ProjectConfig,
	parseProjectConfig,
	type ResolvedProjectConfig,
	resolveProjectConfig,
} from "@superset/shared/project-config";

export type TomlConfigLoad =
	| { kind: "ok"; path: string; resolved: ResolvedProjectConfig }
	| { kind: "invalid"; path: string; errors: ConfigError[] };

/**
 * Only the sandbox's own host-service runs with SUPERSET_HOST_RUN_MODE.
 * IS_SANDBOX is not checked: a local app launched from a sandbox terminal
 * inherits it.
 */
export function configEnvironment(): ConfigEnvironment {
	return process.env.SUPERSET_HOST_RUN_MODE === "sandbox" ? "cloud" : "local";
}

export function getTomlConfigPath(root: string): string {
	return join(root, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE);
}

export function getLocalTomlConfigPath(repoPath: string): string {
	return join(repoPath, PROJECT_CONFIG_DIR, PROJECT_LOCAL_CONFIG_FILE);
}

/** The shared file comes from the workspace's checkout, else the main checkout's. */
export function findTomlConfigPath(args: {
	repoPath: string;
	worktreePath?: string;
}): string | null {
	const roots = args.worktreePath
		? [args.worktreePath, args.repoPath]
		: [args.repoPath];
	for (const root of roots) {
		const path = getTomlConfigPath(root);
		if (existsSync(path)) return path;
	}
	return null;
}

function readConfig(
	path: string,
): { ok: true; config: ProjectConfig } | { ok: false; errors: ConfigError[] } {
	try {
		return parseProjectConfig(readFileSync(path, "utf-8"));
	} catch (error) {
		return {
			ok: false,
			errors: [
				{ message: error instanceof Error ? error.message : String(error) },
			],
		};
	}
}

/**
 * Load `.superset/config.toml` and the personal `config.local.toml` (main
 * checkout only: it is gitignored, so worktrees never have it). Returns null
 * when the project has no `config.toml`, so callers fall back to v1.
 */
export function loadTomlConfig(args: {
	repoPath: string;
	worktreePath?: string;
	environment?: ConfigEnvironment;
}): TomlConfigLoad | null {
	const path = findTomlConfigPath(args);
	if (!path) return null;
	const shared = readConfig(path);
	if (!shared.ok) return { kind: "invalid", path, errors: shared.errors };

	const environment = args.environment ?? configEnvironment();
	const localPath = getLocalTomlConfigPath(args.repoPath);
	let local: ProjectConfig | null = null;
	if (environment === "local" && existsSync(localPath)) {
		const personal = readConfig(localPath);
		if (!personal.ok) {
			return { kind: "invalid", path: localPath, errors: personal.errors };
		}
		local = personal.config;
	}
	return {
		kind: "ok",
		path,
		resolved: resolveProjectConfig({
			base: shared.config,
			local,
			environment,
		}),
	};
}

export function formatConfigErrors({
	path,
	errors,
}: {
	path: string;
	errors: ConfigError[];
}): string[] {
	return [
		`Superset: ${path} is invalid, so nothing was run:`,
		...errors.map(
			(error) =>
				`  ${error.line ? `line ${error.line}: ` : ""}${error.message}`,
		),
	];
}
