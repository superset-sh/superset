import { describe, expect, test } from "bun:test";

import { classifyAsset, summarizeReleases } from "./github";

describe("classifyAsset", () => {
	test("installers are installs, zips are updates, metadata is neither", () => {
		expect(classifyAsset("Superset-1.26.0-arm64.dmg")).toBe("install");
		expect(classifyAsset("superset-1.26.0-x86_64.AppImage")).toBe("install");
		expect(classifyAsset("Superset-1.26.0-arm64-mac.zip")).toBe("update");
		expect(classifyAsset("latest-mac.yml")).toBeNull();
		expect(classifyAsset("Superset-1.26.0-arm64.dmg.blockmap")).toBeNull();
	});
});

describe("summarizeReleases", () => {
	test("keeps published desktop releases and sums downloads by kind", () => {
		const releases = summarizeReleases([
			{
				tag_name: "desktop-v1.26.0",
				draft: false,
				published_at: "2026-09-04T06:41:41Z",
				assets: [
					{ name: "latest-mac.yml", download_count: 34844 },
					{ name: "Superset-1.26.0-arm64-mac.zip", download_count: 11423 },
					{ name: "Superset-1.26.0-arm64.dmg", download_count: 501 },
					{ name: "superset-1.26.0-x86_64.AppImage", download_count: 130 },
				],
			},
			{
				tag_name: "cli-v0.9.0",
				draft: false,
				published_at: "2026-09-03T00:00:00Z",
				assets: [{ name: "superset-cli.zip", download_count: 999 }],
			},
			{
				tag_name: "desktop-v1.27.0",
				draft: true,
				published_at: null,
				assets: [{ name: "Superset-1.27.0-arm64.dmg", download_count: 1 }],
			},
		]);
		expect(releases).toEqual([
			{
				version: "1.26.0",
				publishedAt: "2026-09-04T06:41:41Z",
				installs: 631,
				updates: 11423,
			},
		]);
	});
});
