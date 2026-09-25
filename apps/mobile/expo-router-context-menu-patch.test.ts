import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Guards the bun patch on expo-router (patches/README.md): without
// cancelReactNativeTouches, long-pressing a Link.Menu trigger opens the
// context menu and still fires the row's onPress. Reads the installed package
// so it also passes once an expo-router bump carries the fix upstream.
const swiftFile = join(
	dirname(require.resolve("expo-router/package.json")),
	"ios/LinkPreview/LinkPreviewNativeView.swift",
);

describe("expo-router context-menu touch cancel", () => {
	test("the menu interaction cancels react-native's in-flight touch", () => {
		const source = readFileSync(swiftFile, "utf8");
		expect(source).toContain(
			"configurationForMenuAtLocation location: CGPoint",
		);
		expect(source).toMatch(
			/configurationForMenuAtLocation location: CGPoint\s*\) -> UIContextMenuConfiguration\? \{\s*cancelReactNativeTouches\(\)/,
		);
		expect(source).toContain('NSClassFromString("RCTSurfaceTouchHandler")');
	});
});
