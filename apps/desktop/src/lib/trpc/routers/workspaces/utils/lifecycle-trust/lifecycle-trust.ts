import type { LocalSetupConfig, SetupConfig } from "shared/types/config";

/**
 * Where a lifecycle config was read from. The distinction that matters is not
 * the path but who can write to it: `worktree` is the content of whatever
 * branch a workspace is on, which for a workspace opened from a pull request
 * belongs to whoever opened that pull request.
 */
export type LifecycleConfigSource =
	| "user-config"
	| "local-config"
	| "main-repo"
	| "worktree";

/**
 * Fields of a lifecycle config that steer execution: the three command lists
 * and the working directory they run in.
 */
export const LIFECYCLE_COMMAND_KEYS = ["setup", "teardown", "run"] as const;

export const LIFECYCLE_EXECUTION_KEYS = [
	...LIFECYCLE_COMMAND_KEYS,
	"cwd",
] as const;

export type LifecycleExecutionKey = (typeof LIFECYCLE_EXECUTION_KEYS)[number];

const TRUSTED_SOURCES: ReadonlySet<LifecycleConfigSource> = new Set([
	"user-config",
	"local-config",
	"main-repo",
]);

export function isTrustedLifecycleSource(
	source: LifecycleConfigSource,
): boolean {
	return TRUSTED_SOURCES.has(source);
}

export interface RejectedLifecycleField {
	source: LifecycleConfigSource;
	key: LifecycleExecutionKey;
	value: unknown;
}

/**
 * Drop every execution-steering field from a config that came from an
 * untrusted source, recording what was dropped.
 *
 * Dropping rather than emptying is deliberate: the resolver merges with
 * `override.x ?? base.x`, so an absent key falls back to the trusted config
 * underneath instead of silently disabling a project's real setup script.
 */
export function applyLifecycleTrustBoundary(
	config: SetupConfig,
	source: LifecycleConfigSource,
	rejected: RejectedLifecycleField[],
): SetupConfig {
	if (isTrustedLifecycleSource(source)) {
		return config;
	}

	const safe: SetupConfig = { ...config };

	for (const key of LIFECYCLE_EXECUTION_KEYS) {
		const value = safe[key];
		if (value === undefined) continue;
		rejected.push({ source, key, value });
		delete safe[key];
	}

	return safe;
}

/**
 * Same boundary for the `config.local.json` overlay.
 *
 * Being gitignored is not what makes the local overlay trustworthy — a branch
 * can `git add -f` one — so trust follows the path it was read from, and an
 * untrusted overlay is discarded whole. Returning null rather than an emptied
 * object matters: the caller falls back to the main repo's overlay instead of
 * letting a hostile branch shadow it with nothing.
 */
export function applyLocalLifecycleTrustBoundary(
	config: LocalSetupConfig,
	source: LifecycleConfigSource,
	rejected: RejectedLifecycleField[],
): LocalSetupConfig | null {
	if (isTrustedLifecycleSource(source)) {
		return config;
	}

	for (const key of LIFECYCLE_COMMAND_KEYS) {
		const value = config[key];
		if (value === undefined) continue;
		rejected.push({ source, key, value });
	}

	return null;
}
