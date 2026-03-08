import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import { promisify } from "node:util";
import { shellEnv } from "shell-env";

const execFileAsync = promisify(execFile);

// Cache the shell environment to avoid repeated shell spawns
let cachedEnv: Record<string, string> | null = null;
let cacheTime = 0;
let isFallbackCache = false;
const CACHE_TTL_MS = 60_000; // 1 minute cache
const FALLBACK_CACHE_TTL_MS = 10_000; // 10 second cache for fallback (retry sooner)
const TIMEOUT_FALLBACK_CACHE_TTL_MS = 60_000; // 1 minute fallback when shell startup hangs
const SHELL_ENV_TIMEOUT_MS = 8_000;
let fallbackCacheTtlMs = FALLBACK_CACHE_TTL_MS;

// Track PATH fix state for macOS GUI app PATH fix
let pathFixAttempted = false;
let pathFixSucceeded = false;

class ShellEnvTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`[shell-env] Timed out after ${timeoutMs}ms`);
	}
}

async function getShellEnvWithTimeout(): Promise<Record<string, string>> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		return (await Promise.race([
			shellEnv() as Promise<Record<string, string>>,
			new Promise<never>((_resolve, reject) => {
				timeoutId = setTimeout(() => {
					reject(new ShellEnvTimeoutError(SHELL_ENV_TIMEOUT_MS));
				}, SHELL_ENV_TIMEOUT_MS);
			}),
		])) as Record<string, string>;
	} finally {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
		}
	}
}

/**
 * Gets the full shell environment using sindresorhus/shell-env.
 * Spawns an interactive login shell (-ilc) to capture PATH from ALL configs:
 * - .zprofile/.profile (login): homebrew, system PATH
 * - .zshrc/.bashrc (interactive): nvm, volta, fnm, pnpm, etc.
 *
 * Results are cached for 1 minute to avoid spawning shells repeatedly.
 */
export async function getShellEnvironment(): Promise<Record<string, string>> {
	const now = Date.now();
	const ttl = isFallbackCache ? fallbackCacheTtlMs : CACHE_TTL_MS;
	if (cachedEnv && now - cacheTime < ttl) {
		return { ...cachedEnv };
	}

	try {
		const env = await getShellEnvWithTimeout();
		cachedEnv = env as Record<string, string>;
		cacheTime = now;
		isFallbackCache = false;
		fallbackCacheTtlMs = FALLBACK_CACHE_TTL_MS;
		return { ...cachedEnv };
	} catch (error) {
		const isTimeout = error instanceof ShellEnvTimeoutError;
		console.warn(
			`[shell-env] Failed to get shell environment${isTimeout ? " (timed out)" : ""}: ${error}. Falling back to process.env`,
		);
		const fallback: Record<string, string> = {};
		for (const [key, value] of Object.entries(process.env)) {
			if (typeof value === "string") {
				fallback[key] = value;
			}
		}
		cachedEnv = fallback;
		cacheTime = now;
		isFallbackCache = true;
		fallbackCacheTtlMs = isTimeout
			? TIMEOUT_FALLBACK_CACHE_TTL_MS
			: FALLBACK_CACHE_TTL_MS;
		return { ...fallback };
	}
}

/**
 * Applies the user's full interactive shell environment to the target env,
 * adding any variables not already present.
 *
 * On macOS, GUI apps launched from Finder/Dock start with a minimal process.env
 * that has not sourced ~/.zshrc or ~/.bashrc. This means user-configured
 * credentials like GITHUB_TOKEN are missing from child processes (including the
 * Superset Chat agent harness), even though they work fine in terminal tabs.
 *
 * This function closes that gap by merging the shell-captured environment into
 * the target env without overwriting any variables the Electron process already
 * has set (e.g. NODE_ENV, DATABASE_URL).
 *
 * @param targetEnv - Target environment to apply to. Defaults to process.env.
 * @param shellEnvResult - Shell env override (for testing). When omitted,
 *   getShellEnvironment() is called to spawn an interactive login shell.
 */
export async function applyShellEnvToProcess(
	targetEnv: NodeJS.ProcessEnv = process.env,
	shellEnvResult?: Record<string, string>,
): Promise<void> {
	const env = shellEnvResult ?? (await getShellEnvironment());
	for (const [key, value] of Object.entries(env)) {
		if (targetEnv[key] === undefined) {
			targetEnv[key] = value;
		}
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
	fallbackCacheTtlMs = FALLBACK_CACHE_TTL_MS;
	pathFixAttempted = false;
	pathFixSucceeded = false;
}

/**
 * Returns process env merged with login-shell PATH.
 * Use this for child processes that should resolve binaries exactly
 * as they do in an interactive terminal.
 */
export async function getProcessEnvWithShellPath(
	baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, string>> {
	const shellEnvResult = await getShellEnvironment();
	const env: Record<string, string> = {};

	for (const [key, value] of Object.entries(baseEnv)) {
		if (typeof value === "string") {
			env[key] = value;
		}
	}

	const shellPath = shellEnvResult.PATH || shellEnvResult.Path;
	if (!shellPath) {
		return env;
	}

	env.PATH = shellPath;
	if (
		process.platform === "win32" ||
		"Path" in baseEnv ||
		"Path" in shellEnvResult
	) {
		env.Path = shellPath;
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
			const shellEnvResult = await getShellEnvironment();

			// Retry with fixed env (respect caller's other env vars, force PATH if present)
			const retryEnv = shellEnvResult.PATH
				? { ...shellEnvResult, ...options?.env, PATH: shellEnvResult.PATH }
				: { ...shellEnvResult, ...options?.env };

			const result = await execFileAsync(cmd, args, {
				...options,
				encoding: "utf8",
				env: retryEnv,
			});

			// Persist the fix to process.env only after the retry succeeds.
			if (shellEnvResult.PATH) {
				process.env.PATH = shellEnvResult.PATH;
				pathFixSucceeded = true;
				console.log("[shell-env] Fixed process.env.PATH for GUI app");
			}
			pathFixAttempted = false;
			return result;
		} catch (retryError) {
			// Shell env derivation or retry failed - allow future retries
			pathFixAttempted = false;
			pathFixSucceeded = false;
			console.error("[shell-env] Retry failed:", retryError);
			throw retryError;
		}
	}
}
