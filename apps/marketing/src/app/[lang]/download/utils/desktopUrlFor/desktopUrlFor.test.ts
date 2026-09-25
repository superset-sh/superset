import { describe, expect, test } from "bun:test";
import {
	DOWNLOAD_URL_LINUX_X64,
	DOWNLOAD_URL_MAC_ARM64,
	DOWNLOAD_URL_MAC_X64,
} from "@superset/shared/constants";
import { Platform } from "@/app/[lang]/hooks/useOS";
import {
	desktopUrlFor,
	hasDesktopBuild,
	shouldAutoDownload,
} from "./desktopUrlFor";

describe("shouldAutoDownload", () => {
	// usePlatform starts at Unknown and resolves in an effect. Auto downloading
	// on Unknown redirects every visitor to the Apple Silicon build before
	// detection finishes: an unusable binary on Intel, a .dmg on Linux.
	test("never fires before detection resolves", () => {
		expect(shouldAutoDownload(Platform.Unknown)).toBe(false);
	});

	test("fires for the platforms we publish a binary for", () => {
		expect(shouldAutoDownload(Platform.MacAppleSilicon)).toBe(true);
		expect(shouldAutoDownload(Platform.MacIntel)).toBe(true);
		expect(shouldAutoDownload(Platform.Linux)).toBe(true);
	});

	test("never fires for a platform with no published build", () => {
		expect(shouldAutoDownload(Platform.Windows)).toBe(false);
		expect(shouldAutoDownload(Platform.Mobile)).toBe(false);
	});
});

describe("hasDesktopBuild", () => {
	// The button falls back to a real download on Unknown; only the automatic
	// redirect has to wait. Keeping these apart is the point of the split.
	test("still offers the button a fallback on Unknown", () => {
		expect(hasDesktopBuild(Platform.Unknown)).toBe(true);
	});

	test("offers nothing for platforms we do not build", () => {
		expect(hasDesktopBuild(Platform.Windows)).toBe(false);
		expect(hasDesktopBuild(Platform.Mobile)).toBe(false);
	});
});

describe("desktopUrlFor", () => {
	test("maps each platform to its own artifact", () => {
		expect(desktopUrlFor(Platform.MacAppleSilicon)).toBe(
			DOWNLOAD_URL_MAC_ARM64,
		);
		expect(desktopUrlFor(Platform.MacIntel)).toBe(DOWNLOAD_URL_MAC_X64);
		expect(desktopUrlFor(Platform.Linux)).toBe(DOWNLOAD_URL_LINUX_X64);
	});
});
