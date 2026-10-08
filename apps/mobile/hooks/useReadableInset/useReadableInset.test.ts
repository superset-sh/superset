import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("READABLE_WIDTH", () => {
	// The native composer can't import the JS constant, so it keeps its own;
	// pin the two together so the composer and the screens' column can't
	// drift apart.
	test("matches the native composer's maxWidth", () => {
		// Read the constant from source: importing the hook pulls in
		// react-native, which bun can't load outside the app.
		const hook = readFileSync(
			join(import.meta.dir, "useReadableInset.ts"),
			"utf8",
		);
		const composer = readFileSync(
			join(
				import.meta.dir,
				"../../modules/composer/ios/ComposerRootView.swift",
			),
			"utf8",
		);
		const js = hook.match(/export const READABLE_WIDTH = (\d+);/)?.[1];
		const swift = composer.match(/static let maxWidth: CGFloat = (\d+)/)?.[1];
		expect(js).toBeString();
		expect(swift).toBe(js);
	});
});
