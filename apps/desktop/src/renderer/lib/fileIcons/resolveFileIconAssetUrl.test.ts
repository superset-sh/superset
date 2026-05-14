import { describe, expect, it } from "bun:test";

import { resolveFileIconAssetUrl } from "./resolveFileIconAssetUrl";

describe("resolveFileIconAssetUrl", () => {
	it("resolves against the dev server root", () => {
		expect(
			resolveFileIconAssetUrl(
				"typescript",
				"http://localhost:5173/#/workspace/123",
			),
		).toBe("http://localhost:5173/file-icons/typescript.svg");
	});

	it("resolves against the packaged renderer index file", () => {
		expect(
			resolveFileIconAssetUrl(
				"typescript",
				"file:///Applications/Superset.app/Contents/Resources/app.asar/dist/renderer/index.html#/workspace/123",
			),
		).toBe(
			"file:///Applications/Superset.app/Contents/Resources/app.asar/dist/renderer/file-icons/typescript.svg",
		);
	});
});
