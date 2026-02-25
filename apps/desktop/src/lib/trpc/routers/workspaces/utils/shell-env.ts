import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import {
	getBundledGhBinDir,
	getBundledGhPath,
} from "main/lib/github-cli/bundled-gh";

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

function prependPathEntry(pathValue: string, entry: string): string {
	const delimiter = process.platform === "win32" ? ";" : ":";
	const normalizedEntry =
		process.platform === "win32" ? entry.toLowerCase() : entry;
	const hasEntry = pathValue.split(delimiter).some((current) => {
		const normalizedCurrent =
			process.platform === "win32" ? current.toLowerCase() : current;
		return normalizedCurrent === normalizedEntry;
	});

	if (hasEntry) {
		return pathValue;
	}

	return `${entry}${delimiter}${pathValue}`;
}

function applyBundledGhToPath(pathValue?: string): string | undefined {
	const bundledGhBinDir = getBundledGhBinDir();
	if (!bundledGhBinDir) {
		return pathValue;
	}

	if (!pathValue) {
		return bundledGhBinDir;
	}

	return prependPathEntry(pathValue, bundledGhBinDir);
}

function resolveCommand(cmd: string): string {
	if (cmd !== "gh") {
		return cmd;
	}

	return getBundledGhPath() ?? cmd;
}

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
 * Returns process env merged with login-shell PATH.
 * Use this for child processes that should resolve binaries exactly
 * as they do in an interactive terminal.
 */
export async function getProcessEnvWithShellPath(
	baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, string>> {
	const shellEnv = await getShellEnvironment();
	const env: Record<string, string> = {};

	for (const [key, value] of Object.entries(baseEnv)) {
		if (typeof value === "string") {
			env[key] = value;
		}
	}

	const shellPath = shellEnv.PATH || shellEnv.Path;
	const resolvedPath = applyBundledGhToPath(shellPath || env.PATH || env.Path);
	if (!resolvedPath) {
		return env;
	}

	env.PATH = resolvedPath;
	if (process.platform === "win32" || "Path" in baseEnv || "Path" in shellEnv) {
		env.Path = resolvedPath;
	}

	return env;
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
	const resolvedCmd = resolveCommand(cmd);
	try {
		return await execFileAsync(resolvedCmd, args, {
			...options,
			encoding: "utf8",
		});
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
			const resolvedPath = applyBundledGhToPath(shellEnv.PATH || shellEnv.Path);

			// Persist the fix to process.env so all subsequent calls benefit
			if (resolvedPath) {
				process.env.PATH = resolvedPath;
				pathFixSucceeded = true;
				console.log("[shell-env] Fixed process.env.PATH for GUI app");
			}

			// Retry with fixed env (respect caller's other env vars, force PATH if present)
			const retryEnv = resolvedPath
				? { ...shellEnv, ...options?.env, PATH: resolvedPath }
				: { ...shellEnv, ...options?.env };
			if (
				resolvedPath &&
				("Path" in shellEnv || "Path" in (options?.env ?? {}))
			) {
				(retryEnv as Record<string, string>).Path = resolvedPath;
			}

			return await execFileAsync(resolvedCmd, args, {
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
