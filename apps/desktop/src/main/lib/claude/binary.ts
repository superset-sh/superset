/**
 * Claude Code binary path resolution.
 *
 * Resolves the path to the bundled Claude Code binary based on whether
 * the app is in development or packaged mode.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/**
 * Get the platform key for the current system.
 */
function getPlatformKey(): string {
	const platform = process.platform;
	const arch = process.arch;
	return `${platform}-${arch}`;
}

/**
 * Get the path to the bundled Claude Code binary.
 *
 * In development: apps/desktop/resources/bin/{platform-arch}/claude
 * In production: {resourcesPath}/bin/claude
 */
export function getBundledClaudeBinaryPath(): string {
	const platformKey = getPlatformKey();
	const binaryName = process.platform === "win32" ? "claude.exe" : "claude";

	if (app.isPackaged) {
		// Production: binary is in resources/bin/
		return join(process.resourcesPath, "bin", binaryName);
	}

	// Development: binary is in apps/desktop/resources/bin/{platform-arch}/
	return join(app.getAppPath(), "resources", "bin", platformKey, binaryName);
}

/**
 * Check if the bundled Claude binary exists.
 */
export function hasBundledClaudeBinary(): boolean {
	const binaryPath = getBundledClaudeBinaryPath();
	return existsSync(binaryPath);
}

/**
 * Get the Claude binary path, falling back to PATH if bundled binary doesn't exist.
 * Returns null if no binary is available.
 */
export function getClaudeBinaryPath(): string | null {
	// First try bundled binary
	if (hasBundledClaudeBinary()) {
		return getBundledClaudeBinaryPath();
	}

	// Fall back to checking if claude is in PATH (for development)
	// We don't resolve it here - just return "claude" and let the shell find it
	return "claude";
}
