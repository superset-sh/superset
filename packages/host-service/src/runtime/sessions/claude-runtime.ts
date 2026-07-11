import { accessSync, constants, realpathSync, statSync } from "node:fs";
import path from "node:path";

const CLIENT_APP = "superset-host";

interface CachedExecutable {
	candidate: string;
	key: string;
	path: string;
}

let cachedExecutable: CachedExecutable | null = null;

export class ClaudeCodeExecutableNotFoundError extends Error {
	constructor(options: { pathWasEmpty: boolean; skippedWrapper: boolean }) {
		const reason = options.pathWasEmpty
			? "The user's login-shell PATH snapshot is empty."
			: options.skippedWrapper
				? "Only Superset's Claude wrapper was found; a separate system installation is required."
				: "No Claude executable was found in the user's login-shell PATH.";
		super(
			`${reason} Install Claude Code, ensure \`claude\` is on your login-shell PATH, run \`claude\` once to sign in, then restart Superset.`,
		);
		this.name = "ClaudeCodeExecutableNotFoundError";
	}
}

/**
 * Construct the SDK subprocess environment from the preserved user-shell
 * snapshot. Production passes getTrustedUserShellBaseEnv(), whose provenance
 * boundary excludes process/dotenv fallback values without deleting
 * user-owned variables such as ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN.
 */
export function buildClaudeCodeEnvironment(
	baseEnvironment: Readonly<Record<string, string>>,
): Record<string, string | undefined> {
	return {
		...baseEnvironment,
		// This attribution hint is useful when the user has not selected one,
		// but the login-shell snapshot remains authoritative for every existing
		// Claude/Anthropic variable. Superset cannot infer that an existing value
		// belongs to it, so it must not overwrite it.
		CLAUDE_AGENT_SDK_CLIENT_APP:
			baseEnvironment.CLAUDE_AGENT_SDK_CLIENT_APP ?? CLIENT_APP,
	};
}

/**
 * Find the user's real Claude Code installation without invoking a shell or
 * consulting the mutable host-service process environment.
 *
 * The lookup follows PATH order from the preserved login-shell snapshot,
 * ignores Superset's interception wrappers, canonicalizes symlinks, and only
 * caches successful paths while they remain usable.
 */
export function resolveClaudeCodeExecutable(
	baseEnvironment: Readonly<Record<string, string>>,
): string {
	const platform = process.platform;
	const pathApi = platform === "win32" ? path.win32 : path.posix;
	const pathValue =
		getEnvironmentValue(baseEnvironment, "PATH", platform) ?? "";
	const home = resolveHome(baseEnvironment, platform);
	const key = [platform, pathValue, home].join("\0");

	if (
		cachedExecutable?.key === key &&
		isCachedExecutableUsable(cachedExecutable, platform)
	) {
		return cachedExecutable.path;
	}
	if (cachedExecutable?.key === key) cachedExecutable = null;

	let skippedWrapper = false;
	const names =
		platform === "win32"
			? ["claude.exe", "claude.cmd", "claude.bat", "claude"]
			: ["claude"];
	const delimiter = platform === "win32" ? ";" : ":";

	for (const rawEntry of pathValue.split(delimiter)) {
		const directory = normalizePathEntry(rawEntry, home, pathApi);
		if (!directory) continue;
		if (isSupersetWrapperDirectory(directory, home, pathApi, platform)) {
			skippedWrapper = true;
			continue;
		}

		for (const name of names) {
			const candidate = pathApi.resolve(directory, name);
			if (!isUsableExecutable(candidate, platform)) continue;

			const realPath = realpathSync.native(candidate);
			if (!pathApi.isAbsolute(realPath)) continue;
			if (
				isSupersetWrapperDirectory(
					pathApi.dirname(realPath),
					home,
					pathApi,
					platform,
				)
			) {
				skippedWrapper = true;
				continue;
			}

			cachedExecutable = { candidate, key, path: realPath };
			return realPath;
		}
	}

	throw new ClaudeCodeExecutableNotFoundError({
		pathWasEmpty: pathValue.length === 0,
		skippedWrapper,
	});
}

export function resetClaudeCodeExecutableCacheForTests(): void {
	cachedExecutable = null;
}

function getEnvironmentValue(
	environment: Readonly<Record<string, string>>,
	name: string,
	platform: NodeJS.Platform,
): string | undefined {
	const exact = environment[name];
	if (exact !== undefined || platform !== "win32") return exact;
	const entry = Object.entries(environment).find(
		([key]) => key.toUpperCase() === name,
	);
	return entry?.[1];
}

function resolveHome(
	environment: Readonly<Record<string, string>>,
	platform: NodeJS.Platform,
): string | null {
	const home = getEnvironmentValue(environment, "HOME", platform);
	if (home) return home;
	const userProfile = getEnvironmentValue(environment, "USERPROFILE", platform);
	if (userProfile) return userProfile;
	if (platform !== "win32") return null;
	const drive = getEnvironmentValue(environment, "HOMEDRIVE", platform);
	const homePath = getEnvironmentValue(environment, "HOMEPATH", platform);
	return drive && homePath ? `${drive}${homePath}` : null;
}

function normalizePathEntry(
	rawEntry: string,
	home: string | null,
	pathApi: typeof path.posix | typeof path.win32,
): string | null {
	let entry = rawEntry.trim();
	if (entry.startsWith('"') && entry.endsWith('"')) {
		entry = entry.slice(1, -1);
	}
	if (!entry) return null;
	if (
		home &&
		(entry === "~" || entry.startsWith("~/") || entry.startsWith("~\\"))
	) {
		entry = pathApi.join(home, entry.slice(2));
	}
	// Relative PATH entries depend on the host-service cwd and are therefore
	// unsuitable for a deterministic external-tool boundary.
	if (!pathApi.isAbsolute(entry)) return null;
	return pathApi.normalize(entry);
}

function isSupersetWrapperDirectory(
	directory: string,
	home: string | null,
	pathApi: typeof path.posix | typeof path.win32,
	platform: NodeJS.Platform,
): boolean {
	if (!home) return false;
	const relative = pathApi.relative(
		pathApi.resolve(home),
		pathApi.resolve(directory),
	);
	if (!relative || pathApi.isAbsolute(relative) || relative.startsWith("..")) {
		return false;
	}
	const parts = relative.split(/[\\/]/);
	if (parts.length !== 2) return false;
	const profileDirectory = normalizeCase(parts[0] ?? "", platform);
	const binDirectory = normalizeCase(parts[1] ?? "", platform);
	return (
		binDirectory === "bin" &&
		(profileDirectory === ".superset" ||
			profileDirectory.startsWith(".superset-"))
	);
}

function normalizeCase(value: string, platform: NodeJS.Platform): string {
	return platform === "win32" ? value.toLowerCase() : value;
}

function isUsableExecutable(
	candidate: string,
	platform: NodeJS.Platform,
): boolean {
	try {
		if (!statSync(candidate).isFile()) return false;
		accessSync(
			candidate,
			platform === "win32" ? constants.F_OK : constants.X_OK,
		);
		return true;
	} catch {
		return false;
	}
}

function isCachedExecutableUsable(
	cached: CachedExecutable,
	platform: NodeJS.Platform,
): boolean {
	try {
		return (
			isUsableExecutable(cached.candidate, platform) &&
			realpathSync.native(cached.candidate) === cached.path
		);
	} catch {
		return false;
	}
}
