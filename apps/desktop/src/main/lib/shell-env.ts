import { shellEnv } from "shell-env";

const SHELL_ENV_TIMEOUT_MS = 5000;

function isLaunchedFromTerminal(): boolean {
	return Boolean(process.stdout.isTTY || process.env.TERM_PROGRAM);
}

export function mergePathFromShell(shellPath: string): boolean {
	const currentPath = process.env.PATH || "";
	const currentPaths = new Set(currentPath.split(":").filter(Boolean));
	const shellPaths = shellPath.split(":").filter(Boolean);
	const newPaths = shellPaths.filter((p) => !currentPaths.has(p));

	if (newPaths.length === 0) {
		return false;
	}

	process.env.PATH = [...newPaths, currentPath].filter(Boolean).join(":");
	return true;
}

/** Resolves shell environment for macOS GUI apps (which don't inherit shell env). */
export async function ensureShellEnvVars(): Promise<void> {
	if (process.platform === "win32") {
		return;
	}

	if (isLaunchedFromTerminal()) {
		console.log("[shell-env] Skipping - launched from terminal");
		return;
	}

	try {
		console.log("[shell-env] Resolving shell environment...");

		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(
				() => reject(new Error("Shell environment resolution timed out")),
				SHELL_ENV_TIMEOUT_MS,
			);
		});

		const env = await Promise.race([shellEnv(), timeoutPromise]);

		let resolved = false;

		if (env.ZDOTDIR && !process.env.ZDOTDIR) {
			process.env.ZDOTDIR = env.ZDOTDIR;
			console.log("[shell-env] Resolved ZDOTDIR:", env.ZDOTDIR);
			resolved = true;
		}

		if (env.PATH && mergePathFromShell(env.PATH)) {
			console.log("[shell-env] Merged PATH from shell");
			resolved = true;
		}

		if (!resolved) {
			console.log("[shell-env] No additional env vars needed");
		}
	} catch (error) {
		console.warn("[shell-env] Failed to resolve:", error);
	}
}
