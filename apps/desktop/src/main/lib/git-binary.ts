import { resolveGitBinary, resolveGitExecPath } from "dugite";

let cachedGitPath: string | null = null;
let cachedGitExecPath: string | null = null;

/**
 * Returns the path to the bundled git binary.
 * Uses dugite's embedded git so we don't depend on system git
 * (avoids Xcode license issues on macOS, missing git on Windows, etc.)
 */
export function getGitBinaryPath(): string {
	if (!cachedGitPath) {
		cachedGitPath = resolveGitBinary();
	}
	return cachedGitPath;
}

/**
 * Returns the git exec path for the bundled git.
 * Required for some git operations to find helper binaries.
 */
export function getGitExecPath(): string {
	if (!cachedGitExecPath) {
		cachedGitExecPath = resolveGitExecPath();
	}
	return cachedGitExecPath;
}
