import { app } from "electron";
import { prerelease } from "semver";

/**
 * True for prerelease builds like "0.0.53-canary" (same detection as the
 * auto-updater's channel pick). Stable versions have no prerelease component.
 */
export function isPrereleaseBuild(): boolean {
	const prereleaseComponents = prerelease(app.getVersion());
	return prereleaseComponents !== null && prereleaseComponents.length > 0;
}
