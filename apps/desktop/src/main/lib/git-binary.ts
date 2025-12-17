import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import simpleGit, { type SimpleGit } from "simple-git";

// Dynamic require for dugite - must stay dynamic so dugite isn't bundled
// (dugite needs to be external so its __dirname resolves correctly)
const dynamicRequire =
	typeof require !== "undefined"
		? require
		: // biome-ignore lint/security/noGlobalEval: Required to prevent Vite bundling
			(eval("require") as NodeRequire);

console.log("[git-binary] Module loaded. app.isPackaged:", app.isPackaged);

let cachedGitPath: string | null = null;
let cachedGitExecPath: string | null = null;

// Warning message that simple-git emits even with unsafe option enabled
const SIMPLE_GIT_BINARY_WARNING =
	"Invalid value supplied for custom binary, restricted characters must be removed or supply the unsafe.allowUnsafeCustomBinary option";

/**
 * Returns the path to the bundled git binary.
 *
 * In development: Uses dugite's resolveGitBinary() which works correctly.
 * In packaged app: Manually constructs the path to app.asar.unpacked because
 * dugite's __dirname points inside app.asar, but binaries can't execute from there.
 */
export function getGitBinaryPath(): string {
	if (!cachedGitPath) {
		if (app.isPackaged) {
			// In packaged app, construct path to unpacked dugite
			// app.getAppPath() returns .../Resources/app.asar
			// We need .../Resources/app.asar.unpacked/node_modules/dugite/git/bin/git
			const appPath = app.getAppPath();
			const unpackedPath = appPath.replace("app.asar", "app.asar.unpacked");
			const gitBinary = process.platform === "win32" ? "git.exe" : "git";
			cachedGitPath = join(
				unpackedPath,
				"node_modules",
				"dugite",
				"git",
				"bin",
				gitBinary,
			);

			console.log("[git-binary] Packaged app detected");
			console.log("[git-binary] App path:", appPath);
			console.log("[git-binary] Git binary path:", cachedGitPath);
			console.log("[git-binary] Git binary exists:", existsSync(cachedGitPath));
		} else {
			// In development, use dugite's resolver
			const { resolveGitBinary } = dynamicRequire(
				"dugite",
			) as typeof import("dugite");
			cachedGitPath = resolveGitBinary();

			console.log("[git-binary] Development mode");
			console.log("[git-binary] Git binary path:", cachedGitPath);
			console.log("[git-binary] Git binary exists:", existsSync(cachedGitPath));
		}
	}
	return cachedGitPath;
}

/**
 * Returns the git exec path for the bundled git.
 * Required for some git operations to find helper binaries.
 */
export function getGitExecPath(): string {
	if (!cachedGitExecPath) {
		if (app.isPackaged) {
			// In packaged app, construct path to unpacked dugite libexec
			const appPath = app.getAppPath();
			const unpackedPath = appPath.replace("app.asar", "app.asar.unpacked");
			cachedGitExecPath = join(
				unpackedPath,
				"node_modules",
				"dugite",
				"git",
				"libexec",
				"git-core",
			);

			console.log("[git-binary] Git exec path:", cachedGitExecPath);
		} else {
			// In development, use dugite's resolver
			const { resolveGitExecPath } = dynamicRequire(
				"dugite",
			) as typeof import("dugite");
			cachedGitExecPath = resolveGitExecPath();

			console.log("[git-binary] Git exec path:", cachedGitExecPath);
		}
	}
	return cachedGitExecPath;
}

/**
 * Creates a simpleGit instance configured to use the bundled git binary.
 * Suppresses the spurious warning that simple-git emits because dugite's
 * path contains '@' characters (e.g., dugite@3.0.0) which fail simple-git's
 * overly strict regex validation. The unsafe option makes it a warning
 * instead of an error, but we suppress even the warning to reduce noise.
 */
export function createBundledGit(baseDir?: string): SimpleGit {
	console.log("[git-binary] createBundledGit called with baseDir:", baseDir);

	try {
		const gitPath = getGitBinaryPath();
		console.log("[git-binary] Using git binary:", gitPath);

		// Temporarily suppress the specific warning from simple-git
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			if (args[0] === SIMPLE_GIT_BINARY_WARNING) return;
			originalWarn.apply(console, args);
		};

		try {
			const git = simpleGit({
				...(baseDir && { baseDir }),
				binary: gitPath,
				unsafe: { allowUnsafeCustomBinary: true },
			});
			console.log("[git-binary] simpleGit instance created successfully");
			return git;
		} finally {
			console.warn = originalWarn;
		}
	} catch (error) {
		console.error("[git-binary] ERROR creating git instance:", error);
		throw error;
	}
}
