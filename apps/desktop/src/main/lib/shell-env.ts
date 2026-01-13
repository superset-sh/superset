import { shellEnv } from "shell-env";

/** Timeout for shell environment resolution (ms) */
const SHELL_ENV_TIMEOUT_MS = 5000;

/**
 * Determines if the app was likely launched from a terminal.
 *
 * GUI apps launched via Finder/Spotlight/Dock won't have a TTY attached,
 * while apps launched from a terminal will inherit the terminal's TTY.
 */
function isLaunchedFromTerminal(): boolean {
	// If stdout is a TTY, we're likely running from a terminal
	if (process.stdout.isTTY) {
		return true;
	}

	// Additional heuristic: check for terminal-specific env vars
	// TERM_PROGRAM is set by most terminal emulators
	if (process.env.TERM_PROGRAM) {
		return true;
	}

	return false;
}

/**
 * Merges shell PATH with existing PATH, prepending new entries.
 *
 * This preserves any paths that Electron or the app runtime needs
 * while adding user's shell paths at the front for priority.
 *
 * @returns true if PATH was modified
 */
function mergePathFromShell(shellPath: string): boolean {
	const currentPath = process.env.PATH || "";
	const currentPaths = new Set(currentPath.split(":").filter(Boolean));
	const shellPaths = shellPath.split(":").filter(Boolean);

	// Find paths in shell that aren't in current env
	const newPaths = shellPaths.filter((p) => !currentPaths.has(p));

	if (newPaths.length === 0) {
		return false;
	}

	// Prepend new paths so user's shell paths take priority
	process.env.PATH = [...newPaths, currentPath].filter(Boolean).join(":");
	return true;
}

/**
 * Ensures shell environment variables are available in the main process.
 *
 * On macOS, GUI apps launched via Finder/Spotlight/Dock don't inherit
 * environment variables from the user's shell configuration (.zshrc, .zprofile, etc.).
 * This causes issues with:
 * - Custom ZDOTDIR configurations not being detected
 * - PATH missing user-installed tools (homebrew, nvm, etc.)
 *
 * This function spawns a login shell to capture the user's full environment
 * and persists key variables to process.env for use by terminal sessions.
 *
 * @see https://github.com/sindresorhus/shell-env
 */
export async function ensureShellEnvVars(): Promise<void> {
	// Only needed on macOS/Linux - Windows GUI apps work differently
	if (process.platform === "win32") {
		return;
	}

	// Skip if launched from terminal - env is already inherited correctly
	if (isLaunchedFromTerminal()) {
		console.log(
			"[shell-env] Skipping resolution - launched from terminal (TTY detected)",
		);
		return;
	}

	try {
		console.log("[shell-env] Resolving shell environment for GUI app...");

		// Race against timeout to prevent hanging on slow/broken shell configs
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(
				() => reject(new Error("Shell environment resolution timed out")),
				SHELL_ENV_TIMEOUT_MS,
			);
		});

		const env = await Promise.race([shellEnv(), timeoutPromise]);

		let resolved = false;

		// Persist ZDOTDIR for terminal shell wrapper initialization
		if (env.ZDOTDIR && !process.env.ZDOTDIR) {
			process.env.ZDOTDIR = env.ZDOTDIR;
			console.log("[shell-env] Resolved ZDOTDIR:", env.ZDOTDIR);
			resolved = true;
		}

		// Merge PATH to ensure user-installed tools are available
		// while preserving any paths the Electron runtime needs
		if (env.PATH && mergePathFromShell(env.PATH)) {
			console.log("[shell-env] Merged PATH from shell");
			resolved = true;
		}

		if (resolved) {
			console.log("[shell-env] Shell environment resolved successfully");
		} else {
			console.log(
				"[shell-env] No additional environment variables needed from shell",
			);
		}
	} catch (error) {
		// Don't crash the app - fall back to current behavior
		// This can happen if the user's shell config has errors or times out
		console.warn("[shell-env] Failed to resolve shell environment:", error);
		console.warn(
			"[shell-env] Falling back to process.env - some shell configurations may not work",
		);
	}
}
