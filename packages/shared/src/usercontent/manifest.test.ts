import { describe, expect, test } from "bun:test";
import { parsePageManifest } from "./manifest";

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
