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

/**
 * True on builds that ship to the team, not the public: canary releases and
 * unpackaged dev runs (`bun dev` carries a stable-looking version). Gates
 * pre-release features without a user-facing setting.
 */
export function isInternalBuild(): boolean {
	return isPrereleaseBuild() || !app.isPackaged;
}
