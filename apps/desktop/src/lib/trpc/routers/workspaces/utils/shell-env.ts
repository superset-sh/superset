import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Cache the shell environment to avoid repeated shell spawns
let cachedEnv: Record<string, string> | null = null;
let cacheTime = 0;
let isFallbackCache = false;
const CACHE_TTL_MS = 60_000; // 1 minute cache
const FALLBACK_CACHE_TTL_MS = 10_000; // 10 second cache for fallback (retry sooner)

// Track PATH fix state for macOS GUI app PATH fix
let pathFixAttempted = false;
let pathFixSucceeded = false;

/**
 * Gets the full shell environment by spawning a login shell.
 * This captures PATH and other environment variables set in shell profiles
 * which includes tools installed via homebrew.
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

	const shell =
		process.env.SHELL ||
		(process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");

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
 * Clears the cached shell environment.
 * Useful for testing or when environment changes are expected.
 */
export function clearShellEnvCache(): void {
	cachedEnv = null;
	cacheTime = 0;
	isFallbackCache = false;
}

/**
 * Execute a command, retrying once with shell environment if it fails with ENOENT.
 * On macOS, GUI apps launched from Finder/Dock get minimal PATH that excludes
 * homebrew and other user-installed tools. This lazily derives the user's
 * shell environment only when needed, then persists the fix to process.env.PATH.
 */
export async function execWithShellEnv(
	cmd: string,
	args: string[],
	options?: Omit<ExecFileOptionsWithStringEncoding, "encoding">,
): Promise<{ stdout: string; stderr: string }> {
	try {
		return await execFileAsync(cmd, args, { ...options, encoding: "utf8" });
	} catch (error) {
		// Only retry on ENOENT (command not found), only on macOS
		// Skip if we've already successfully fixed PATH, or if a fix attempt is in progress
		if (
			process.platform !== "darwin" ||
			pathFixSucceeded ||
			pathFixAttempted ||
			!(error instanceof Error) ||
			!("code" in error) ||
			error.code !== "ENOENT"
		) {
			throw error;
		}

		pathFixAttempted = true;
		console.log("[shell-env] Command not found, deriving shell environment");

		try {
			const shellEnv = await getShellEnvironment();

			// Persist the fix to process.env so all subsequent calls benefit
			if (shellEnv.PATH) {
				process.env.PATH = shellEnv.PATH;
				pathFixSucceeded = true;
				console.log("[shell-env] Fixed process.env.PATH for GUI app");
			}

			// Retry with fixed env (respect caller's other env vars, force PATH if present)
			const retryEnv = shellEnv.PATH
				? { ...shellEnv, ...options?.env, PATH: shellEnv.PATH }
				: { ...shellEnv, ...options?.env };

			return await execFileAsync(cmd, args, {
				...options,
				encoding: "utf8",
				env: retryEnv,
			});
		} catch (retryError) {
			// Shell env derivation or retry failed - allow future retries
			pathFixAttempted = false;
			console.error("[shell-env] Retry failed:", retryError);
			throw retryError;
		}
	}
}
