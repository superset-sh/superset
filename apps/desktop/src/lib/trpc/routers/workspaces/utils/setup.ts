import { cpSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import {
	CONFIG_FILE_NAME,
	LOCAL_CONFIG_FILE_NAME,
	PROJECT_SUPERSET_DIR_NAME,
	PROJECTS_DIR_NAME,
	SUPERSET_DIR_NAME,
} from "shared/constants";
import type { LocalSetupConfig, SetupConfig } from "shared/types";

const CREDENTIAL_FILE_NAMES = new Set([
	"credentials.json",
	".credentials.json",
	".netrc",
]);

const CREDENTIAL_FILE_SUFFIXES = [".pem", ".key", ".p12", ".pfx"];

/** Dotenv names that are checked-in templates, not real credentials. */
const DOTENV_TEMPLATE_SUFFIXES = [".example", ".sample", ".template"];

function isDotenvFile(name: string): boolean {
	return name === ".env" || name.startsWith(".env.") || name.endsWith(".env");
}

/**
 * Files whose contents are credentials rather than project configuration.
 *
 * Deliberately conservative: `.npmrc` is left out because it doubles as
 * registry configuration that installs inside the worktree may need.
 */
function isCredentialFile(name: string): boolean {
	const lower = name.toLowerCase();

	if (isDotenvFile(lower)) {
		return !DOTENV_TEMPLATE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
	}

	return (
		CREDENTIAL_FILE_NAMES.has(lower) ||
		CREDENTIAL_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix))
	);
}

export interface WorktreeConfigCopyResult {
	/** Whether a `.superset` directory was written into the worktree. */
	copied: boolean;
	/** `.superset`-relative paths of credential files left behind. */
	skippedSecretFiles: string[];
}

/**
 * Worktrees don't include gitignored files, so copy .superset from main repo
 * if it's missing — ensures setup scripts like "./.superset/setup.sh" work.
 *
 * Credential files are excluded. This copy runs once, at worktree creation, and
 * is never refreshed, so a snapshotted secret outlives every later rotation:
 * the main checkout picks up the new value while the worktree keeps serving the
 * old one (superset-sh/superset#5945). Setup scripts should read secrets from
 * the main checkout at run time — `$SUPERSET_ROOT_PATH/.superset/.env` — which
 * always resolves the current value.
 */
export function copySupersetConfigToWorktree(
	mainRepoPath: string,
	worktreePath: string,
): WorktreeConfigCopyResult {
	const mainSupersetDir = join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME);
	const worktreeSupersetDir = join(worktreePath, PROJECT_SUPERSET_DIR_NAME);

	if (!existsSync(mainSupersetDir) || existsSync(worktreeSupersetDir)) {
		return { copied: false, skippedSecretFiles: [] };
	}

	const skippedSecretFiles: string[] = [];

	try {
		cpSync(mainSupersetDir, worktreeSupersetDir, {
			recursive: true,
			filter: (source) => {
				if (!isCredentialFile(basename(source))) return true;
				skippedSecretFiles.push(relative(mainSupersetDir, source));
				return false;
			},
		});
	} catch (error) {
		console.error(
			`Failed to copy ${PROJECT_SUPERSET_DIR_NAME} to worktree: ${error instanceof Error ? error.message : String(error)}`,
		);
		return { copied: false, skippedSecretFiles };
	}

	if (skippedSecretFiles.length > 0) {
		console.warn(
			`Did not copy credential files into ${worktreePath}: ${skippedSecretFiles.join(", ")}. ` +
				`Read them from $SUPERSET_ROOT_PATH/${PROJECT_SUPERSET_DIR_NAME} in your setup script so rotated values stay current.`,
		);
	}

	return { copied: true, skippedSecretFiles };
}

function readConfigFile(configPath: string): SetupConfig | null {
	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(content) as SetupConfig;

		if (parsed.setup && !Array.isArray(parsed.setup)) {
			throw new Error("'setup' field must be an array of strings");
		}

		if (parsed.teardown && !Array.isArray(parsed.teardown)) {
			throw new Error("'teardown' field must be an array of strings");
		}

		if (parsed.run && !Array.isArray(parsed.run)) {
			throw new Error("'run' field must be an array of strings");
		}

		if (parsed.cwd !== undefined) {
			if (typeof parsed.cwd !== "string" || parsed.cwd.trim().length === 0) {
				throw new Error("'cwd' field must be a non-empty string");
			}
			parsed.cwd = parsed.cwd.trim();
		}

		return parsed;
	} catch (error) {
		console.error(
			`Failed to read setup config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

function readConfigFromPath(basePath: string): SetupConfig | null {
	return readConfigFile(
		join(basePath, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME),
	);
}

function readLocalConfigFile(filePath: string): LocalSetupConfig | null {
	if (!existsSync(filePath)) {
		return null;
	}

	try {
		const content = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(content) as LocalSetupConfig;

		for (const key of ["setup", "teardown", "run"] as const) {
			const value = parsed[key];
			if (value === undefined) continue;

			if (Array.isArray(value)) continue;

			if (typeof value === "object" && value !== null) {
				if (value.before !== undefined && !Array.isArray(value.before)) {
					throw new Error(`'${key}.before' must be an array of strings`);
				}
				if (value.after !== undefined && !Array.isArray(value.after)) {
					throw new Error(`'${key}.after' must be an array of strings`);
				}
				continue;
			}

			throw new Error(
				`'${key}' must be an array of strings or an object with before/after`,
			);
		}

		return parsed;
	} catch (error) {
		console.error(
			`Failed to read local config at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

function readLocalConfigFromPath(basePath: string): LocalSetupConfig | null {
	return readLocalConfigFile(
		join(basePath, PROJECT_SUPERSET_DIR_NAME, LOCAL_CONFIG_FILE_NAME),
	);
}

function mergeBaseConfigs(
	base: SetupConfig | null,
	override: SetupConfig | null,
): SetupConfig | null {
	if (!base) return override;
	if (!override) return base;

	return {
		setup: override.setup ?? base.setup,
		teardown: override.teardown ?? base.teardown,
		run: override.run ?? base.run,
		cwd: override.cwd ?? base.cwd,
	};
}

/**
 * Merge a base config with a local config overlay.
 *
 * For each key (setup, teardown):
 *   - local is array       → override (replace base entirely)
 *   - local is {before,after} → merge: [...before, ...base, ...after]
 *   - local is undefined   → passthrough (use base)
 */
export function mergeConfigs(
	base: SetupConfig,
	local: LocalSetupConfig,
): SetupConfig {
	const result: SetupConfig = { ...base };

	for (const key of ["setup", "teardown", "run"] as const) {
		const localValue = local[key];
		if (localValue === undefined) continue;

		if (Array.isArray(localValue)) {
			result[key] = localValue;
		} else {
			const before = localValue.before ?? [];
			const after = localValue.after ?? [];
			result[key] = [...before, ...(base[key] ?? []), ...after];
		}
	}

	return result;
}

/**
 * Resolves setup/teardown/run config with a three-tier priority:
 *   1. User override:  ~/.superset/projects/<projectId>/config.json
 *   2. Worktree:       <worktreePath>/.superset/config.json
 *   3. Main repo:      <mainRepoPath>/.superset/config.json
 *
 * Higher-priority configs override only the keys they explicitly define.
 * Missing keys inherit from lower-priority sources, so stale copied worktree
 * configs do not mask newly added project-level commands like `run`.
 *
 * After resolving the base config, a local overlay is applied if
 * `.superset/config.local.json` exists in the workspace (worktree or main repo).
 * The local config can prepend (before), append (after), or override each key.
 */
export function loadSetupConfig({
	mainRepoPath,
	worktreePath,
	projectId,
}: {
	mainRepoPath: string;
	worktreePath?: string;
	projectId?: string;
}): SetupConfig | null {
	let base = readConfigFromPath(mainRepoPath);

	if (worktreePath) {
		const config = readConfigFromPath(worktreePath);
		if (config) {
			base = mergeBaseConfigs(base, config);
		}
	}

	if (projectId && !projectId.includes("/") && !projectId.includes("\\")) {
		const userConfigPath = join(
			homedir(),
			SUPERSET_DIR_NAME,
			PROJECTS_DIR_NAME,
			projectId,
			CONFIG_FILE_NAME,
		);
		const config = readConfigFile(userConfigPath);
		if (config) {
			base = mergeBaseConfigs(base, config);
		}
	}

	if (!base) return null;

	// Apply local config overlay (worktree first, then main repo)
	const worktreeLocal = worktreePath
		? readLocalConfigFromPath(worktreePath)
		: null;
	const localConfig = worktreeLocal ?? readLocalConfigFromPath(mainRepoPath);

	if (localConfig) {
		return mergeConfigs(base, localConfig);
	}

	return base;
}
