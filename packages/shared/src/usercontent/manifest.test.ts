import { describe, expect, test } from "bun:test";
import {
	type PageManifest,
	type PageVisibility,
	parsePageManifest,
	publiclyReadable,
} from "./manifest";

const base = {
	v: 1,
	pageId: "d28d7b35-813f-43a0-b3f9-9d8988dd1d58",
	slug: "demo",
	visibility: "org",
	sharedVersion: null,
	latestVersion: 2,
};

describe("parsePageManifest", () => {
	test("parses versions with and without assets", () => {
		const manifest = parsePageManifest(
			JSON.stringify({
				...base,
				versions: {
					"1": {
						key: "pages/x/versions/1/index.html",
						contentType: "text/html",
					},
					"2": {
						key: "pages/x/versions/2/index.html",
						contentType: "text/html",
						assets: {
							"demo.mp4": {
								key: "files/f1/original",
								contentType: "video/mp4",
							},
						},
					},
				},
			}),
		);
		expect(manifest?.versions["1"]?.assets).toBeUndefined();
		expect(manifest?.versions["2"]?.assets?.["demo.mp4"]).toEqual({
			key: "files/f1/original",
			contentType: "video/mp4",
		});
	});

	test("rejects malformed assets", () => {
		for (const assets of [null, "x", { "a.png": { key: 1 } }]) {
			expect(
				parsePageManifest(
					JSON.stringify({
						...base,
						versions: { "1": { key: "k", contentType: "text/html", assets } },
					}),
				),
			).toBeNull();
		}
	});
});

describe("publiclyReadable", () => {
	const manifest = (
		visibility: PageVisibility,
		sharedVersion: number | null,
		latestVersion: number | null = 3,
	): PageManifest => ({
		v: 1,
		pageId: base.pageId,
		slug: base.slug,
		visibility,
		sharedVersion,
		latestVersion,
		versions: {
			"1": { key: "k1", contentType: "text/html" },
			"2": { key: "k2", contentType: "text/html" },
			"3": { key: "k3", contentType: "text/html" },
		},
	});

	test("opens only the pinned version a public page serves", () => {
		const pinned = manifest("everyone", 2);
		expect(publiclyReadable(pinned, 2)).toBe(true);
		expect(publiclyReadable(pinned, 1)).toBe(false);
		expect(publiclyReadable(pinned, 3)).toBe(false);
	});

	test("follows the latest version when a public page pins none", () => {
		const unpinned = manifest("everyone", null);
		expect(publiclyReadable(unpinned, 3)).toBe(true);
		expect(publiclyReadable(unpinned, 2)).toBe(false);
	});

	test("keeps narrower visibilities closed at every version", () => {
		for (const visibility of ["just_me", "org"] as const) {
			for (const version of [1, 2, 3]) {
				expect(publiclyReadable(manifest(visibility, 2), version)).toBe(false);
			}
		}
	});

	test("stays closed when a public page serves nothing", () => {
		expect(publiclyReadable(manifest("everyone", null, null), 1)).toBe(false);
	});
});
