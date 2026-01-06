import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Cache the shell environment to avoid repeated shell spawns
let cachedEnv: Record<string, string> | null = null;
let cacheTime = 0;
let isFallbackCache = false;
const CACHE_TTL_MS = 60_000; // 1 minute cache
const FALLBACK_CACHE_TTL_MS = 10_000; // 10 second cache for fallback (retry sooner)

/**
 * Gets the full shell environment by spawning a login shell.
 * This captures PATH and other environment variables set in shell profiles
 * which includes tools like git-lfs installed via homebrew.
 *
 * Uses -lc (login, command) instead of -ilc to avoid interactive prompts
 * and TTY issues from dotfiles expecting a terminal.
 *
 * Results are cached for 1 minute to avoid spawning shells repeatedly.
 */
export async function getShellEnvironment(): Promise<Record<string, string>> {
	const now = Date.now();
	const ttl = isFallbackCache ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS;
	if (cachedEnv && now - cacheTime < ttl) {
		// Return a copy to prevent caller mutations from corrupting cache
		return { ...cachedEnv };
	}

	const shell = process.env.SHELL || "/bin/bash";

	try {
		// Use -lc flags (not -ilc):
		// -l: login shell (sources .zprofile/.profile for PATH setup)
		// -c: execute command
		// Avoids -i (interactive) to skip TTY prompts and reduce latency
		const { stdout } = await execFileAsync(shell, ["-lc", "env"], {
			timeout: 10_000,
			env: {
				...process.env,
				HOME: os.homedir(),
			},
		});

		const env: Record<string, string> = {};
		for (const line of stdout.split("\n")) {
			const idx = line.indexOf("=");
			if (idx > 0) {
				const key = line.substring(0, idx);
				const value = line.substring(idx + 1);
				env[key] = value;
			}
		}

		cachedEnv = env;
		cacheTime = now;
		isFallbackCache = false;
		return { ...env };
	} catch (error) {
		console.warn(
			`[shell-env] Failed to get shell environment: ${error}. Falling back to process.env`,
		);
		// Fall back to process.env if shell spawn fails
		// Cache with shorter TTL so we retry sooner
		const fallback: Record<string, string> = {};
		for (const [key, value] of Object.entries(process.env)) {
			if (typeof value === "string") {
				fallback[key] = value;
			}
		}
		cachedEnv = fallback;
		cacheTime = now;
		isFallbackCache = true;
		return { ...fallback };
	}
}

/**
 * Checks if git-lfs is available in the given environment.
 */
export async function checkGitLfsAvailable(
	env: Record<string, string>,
): Promise<boolean> {
	try {
		await execFileAsync("git", ["lfs", "version"], {
			timeout: 5_000,
			env,
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Clears the cached shell environment.
 * Useful for testing or when environment changes are expected.
 */
export function clearShellEnvCache(): void {
	cachedEnv = null;
	cacheTime = 0;
	isFallbackCache = false;
}
