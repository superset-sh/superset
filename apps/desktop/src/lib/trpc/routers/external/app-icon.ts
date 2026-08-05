import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import nodePath from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { getProcessEnvWithShellPath } from "../workspaces/utils/shell-env";

const execFileAsync = promisify(execFile);

const iconCache = new Map<string, string | null>();

function findAppBundlePath(executablePath: string): string | null {
	let current = executablePath;
	while (true) {
		if (current.toLowerCase().endsWith(".app")) return current;
		const parent = nodePath.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

async function resolveExecutablePath(
	executable: string,
): Promise<string | null> {
	try {
		const env = await getProcessEnvWithShellPath();
		const { stdout } = await execFileAsync("/usr/bin/which", [executable], {
			env,
			timeout: 5_000,
		});
		const resolved = stdout.trim().split("\n")[0];
		return resolved || null;
	} catch {
		return null;
	}
}

async function resolveAppIcon(executable: string): Promise<string | null> {
	// Presets store plain commands; a path-y executable would bypass the PATH
	// lookup semantics users expect, so only bare names are resolved.
	if (executable.includes("/")) return null;

	const resolvedPath = await resolveExecutablePath(executable);
	if (!resolvedPath) return null;

	let realPath: string;
	try {
		realPath = await realpath(resolvedPath);
	} catch {
		return null;
	}

	const bundlePath = findAppBundlePath(realPath);
	if (!bundlePath) return null;

	try {
		// "normal" (32px) is the largest size macOS supports for getFileIcon.
		const icon = await app.getFileIcon(bundlePath, { size: "normal" });
		return icon.isEmpty() ? null : icon.toDataURL();
	} catch {
		return null;
	}
}

/**
 * Resolves the macOS app-bundle icon for a CLI executable whose binary lives
 * inside a `.app` bundle (e.g. `fork` → Fork.app, `zed` → Zed.app). Returns a
 * data URI, or null when the executable does not belong to an app bundle.
 */
export async function getAppIconForExecutable(
	executable: string,
): Promise<string | null> {
	if (process.platform !== "darwin") return null;

	const cached = iconCache.get(executable);
	if (cached !== undefined) return cached;

	const iconDataUri = await resolveAppIcon(executable);
	iconCache.set(executable, iconDataUri);
	return iconDataUri;
}
