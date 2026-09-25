import { describe, expect, test } from "bun:test";
import { classifyAsset, toReleasePlatforms } from "./toReleasePlatforms";

// Verbatim asset list from the desktop-v1.25.1 release.
const REAL_ASSETS = [
	"latest-linux.yml",
	"latest-mac.yml",
	"Superset-1.25.1-arm64-mac.zip",
	"Superset-1.25.1-arm64.dmg",
	"Superset-1.25.1-mac.zip",
	"superset-1.25.1-x86_64.AppImage",
	"Superset-1.25.1.dmg",
	"Superset-arm64-mac.zip",
	"Superset-arm64.dmg",
	"Superset-x64-mac.zip",
	"Superset-x64.dmg",
	"Superset-x86_64.AppImage",
].map((name) => ({
	name,
	size: 100,
	browser_download_url: `https://example.test/${name}`,
}));

describe("classifyAsset", () => {
	test("labels the mac disk images by architecture", () => {
		expect(classifyAsset("Superset-1.25.1-arm64.dmg", "1.25.1")).toMatchObject({
			os: "macOS",
			key: "mac-arm64",
			label: "Mac (Apple Silicon)",
		});
		expect(classifyAsset("Superset-1.25.1.dmg", "1.25.1")).toMatchObject({
			os: "macOS",
			key: "mac-x64",
			label: "Mac (Intel)",
		});
	});

	test("labels the linux AppImage", () => {
		expect(
			classifyAsset("superset-1.25.1-x86_64.AppImage", "1.25.1"),
		).toMatchObject({
			os: "Linux",
			key: "linux-appimage-x64",
			label: "Linux AppImage (x64)",
		});
	});

	test("drops update manifests", () => {
		expect(classifyAsset("latest-mac.yml", "1.25.1")).toBeNull();
	});

	// The -mac.zip archives exist for electron-updater, not for people.
	test("drops the updater zip archives", () => {
		expect(classifyAsset("Superset-1.25.1-arm64-mac.zip", "1.25.1")).toBeNull();
		expect(classifyAsset("Superset-1.25.1-mac.zip", "1.25.1")).toBeNull();
	});

	// The unversioned aliases point at the same files as the versioned assets;
	// keeping them would list every download twice.
	test("drops the unversioned latest aliases", () => {
		expect(classifyAsset("Superset-arm64.dmg", "1.25.1")).toBeNull();
		expect(classifyAsset("Superset-x86_64.AppImage", "1.25.1")).toBeNull();
	});
});

describe("toReleasePlatforms", () => {
	test("groups a real release into macOS then Linux, no duplicates", () => {
		const platforms = toReleasePlatforms(REAL_ASSETS, "1.25.1");

		expect(platforms.map((platform) => platform.os)).toEqual([
			"macOS",
			"Linux",
		]);
		expect(platforms[0]?.assets.map((asset) => asset.label)).toEqual([
			"Mac (Apple Silicon)",
			"Mac (Intel)",
		]);
		expect(platforms[1]?.assets.map((asset) => asset.label)).toEqual([
			"Linux AppImage (x64)",
		]);
	});

	// The spec block and download button look assets up by key, so the keys are
	// contract, not decoration.
	test("gives every asset a stable key", () => {
		const platforms = toReleasePlatforms(REAL_ASSETS, "1.25.1");
		expect(platforms.flatMap((p) => p.assets.map((a) => a.key))).toEqual([
			"mac-arm64",
			"mac-x64",
			"linux-appimage-x64",
		]);
	});

	test("omits a platform with no shipped artifact", () => {
		const platforms = toReleasePlatforms(REAL_ASSETS, "1.25.1");
		expect(platforms.some((platform) => platform.os === "Windows")).toBe(false);
	});

	test("picks up windows and deb artifacts once they ship", () => {
		const platforms = toReleasePlatforms(
			[
				{
					name: "Superset-2.0.0-x64.exe",
					size: 1,
					browser_download_url: "https://example.test/exe",
				},
				{
					name: "superset-2.0.0-arm64.deb",
					size: 1,
					browser_download_url: "https://example.test/deb",
				},
			],
			"2.0.0",
		);

		expect(platforms.map((platform) => platform.os)).toEqual([
			"Windows",
			"Linux",
		]);
		expect(platforms[0]?.assets[0]?.label).toBe("Windows (x64)");
		expect(platforms[1]?.assets[0]?.label).toBe("Linux .deb (arm64)");
	});
});
