import { execFileSync } from "node:child_process";
import { app } from "electron";

/**
 * Detect whether the Linux namespace sandbox is available and, if not,
 * fall back to --no-sandbox so the app can still launch.
 *
 * Background: Electron's Chromium sandbox on Linux needs either:
 *   1. A SUID chrome-sandbox binary (doesn't work in AppImage), or
 *   2. Unprivileged user namespaces (blocked by AppArmor on Ubuntu 24.04+)
 *
 * This probes option 2 with `unshare -Ur true`. If the probe fails, we
 * append --no-sandbox before the app initialises Chromium.
 *
 * @see https://github.com/electron/electron/issues/41066
 */
export function applyLinuxSandboxFallback(): boolean {
	if (process.platform !== "linux") return false;

	if (isNamespaceSandboxAvailable()) return false;

	console.warn(
		"[sandbox] User namespace sandbox unavailable — falling back to --no-sandbox",
	);
	app.commandLine.appendSwitch("no-sandbox");
	return true;
}

/**
 * Returns `true` when unprivileged user namespaces work on this system.
 * The check mirrors what Chromium itself does: try to create a user
 * namespace and immediately exit.
 */
export function isNamespaceSandboxAvailable(): boolean {
	try {
		execFileSync("unshare", ["-Ur", "true"], {
			timeout: 2000,
			stdio: "ignore",
		});
		return true;
	} catch {
		return false;
	}
}
