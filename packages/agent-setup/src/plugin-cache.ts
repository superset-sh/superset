import path from "node:path";
import { resolveSupersetHomeDir } from "./paths";

const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/;

/** One path segment of the plugin cache: no traversal, no separators. */
export function isSafePluginSegment(value: string): boolean {
	return (
		typeof value === "string" &&
		SAFE_SEGMENT.test(value) &&
		!value.includes("..")
	);
}

export function assertSafePluginSegment(value: string, label: string): string {
	if (!isSafePluginSegment(value)) {
		throw new Error(
			`Refusing to use ${label} "${value}": it must be alphanumeric with dots, dashes, pluses, or underscores, and cannot contain "..".`,
		);
	}
	return value;
}

export function pluginCacheDir(): string {
	return path.join(resolveSupersetHomeDir(), "plugins", "cache");
}

/**
 * Where an installed plugin's tree lives, on a laptop and in a box alike. The
 * version is in the path, so a tree either exists at its version or does not.
 */
export function pluginCachePath(
	marketplace: string,
	name: string,
	version: string,
): string {
	return path.join(
		pluginCacheDir(),
		assertSafePluginSegment(marketplace, "marketplace"),
		assertSafePluginSegment(name, "plugin name"),
		assertSafePluginSegment(version, "version"),
	);
}
