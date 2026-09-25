import {
	DOWNLOAD_URL_LINUX_X64,
	DOWNLOAD_URL_MAC_ARM64,
	DOWNLOAD_URL_MAC_X64,
} from "@superset/shared/constants";
import { Platform } from "@/app/[lang]/hooks/useOS";

// Which platforms we actually publish a desktop binary for. Windows is
// configured in electron-builder but no installer has shipped yet, so it is
// deliberately absent — the page must not offer a download that does not exist.
//
// Unknown counts as buildable so the *button* always has something to offer,
// falling back to the Apple Silicon build. That fallback is safe for a link
// somebody chooses to click and unsafe for an automatic redirect, which is what
// shouldAutoDownload exists to separate.
export function hasDesktopBuild(platform: Platform): boolean {
	return (
		platform === Platform.MacAppleSilicon ||
		platform === Platform.MacIntel ||
		platform === Platform.Linux ||
		platform === Platform.Unknown
	);
}

// Unknown is the pre-detection state of usePlatform, not a real platform. Auto
// downloading on it hands every visitor the Apple Silicon build before
// detection resolves: an unusable binary on an Intel Mac, a .dmg on Linux.
export function shouldAutoDownload(platform: Platform): boolean {
	return platform !== Platform.Unknown && hasDesktopBuild(platform);
}

// Points at the `releases/latest` aliases rather than a pinned version, so the
// link keeps working across releases without a redeploy.
export function desktopUrlFor(platform: Platform): string {
	if (platform === Platform.MacIntel) return DOWNLOAD_URL_MAC_X64;
	if (platform === Platform.Linux) return DOWNLOAD_URL_LINUX_X64;
	return DOWNLOAD_URL_MAC_ARM64;
}
