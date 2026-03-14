import { describe, expect, mock, test } from "bun:test";

/**
 * Regression test for https://github.com/nicepkg/superset/issues/2413
 *
 * The Settings back button should navigate to a fixed route (breadcrumb)
 * instead of using router.back() which depends on browser/app history.
 */

// Track which router methods are called
const routerCalls: { method: string; args: unknown[] }[] = [];

// Mock expo-router
mock.module("expo-router", () => ({
	useRouter: () => ({
		back: (...args: unknown[]) => {
			routerCalls.push({ method: "back", args });
		},
		navigate: (...args: unknown[]) => {
			routerCalls.push({ method: "navigate", args });
		},
		push: (...args: unknown[]) => {
			routerCalls.push({ method: "push", args });
		},
		replace: (...args: unknown[]) => {
			routerCalls.push({ method: "replace", args });
		},
	}),
}));

// Mock react-native-safe-area-context
mock.module("react-native-safe-area-context", () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Minimal React Native mocks for JSX rendering
mock.module("react-native", () => {
	const { createElement } = require("react");
	const makeComponent = (name: string) => (props: Record<string, unknown>) =>
		createElement(name, props);
	return {
		ScrollView: makeComponent("ScrollView"),
		View: makeComponent("View"),
		Pressable: makeComponent("Pressable"),
		Text: makeComponent("Text"),
		StyleSheet: { create: (s: unknown) => s },
	};
});

// Mock UI components
mock.module("@/components/ui/card", () => {
	const { createElement } = require("react");
	const makeComponent = (name: string) => (props: Record<string, unknown>) =>
		createElement(name, props);
	return {
		Card: makeComponent("Card"),
		CardContent: makeComponent("CardContent"),
		CardHeader: makeComponent("CardHeader"),
		CardTitle: makeComponent("CardTitle"),
	};
});

mock.module("@/components/ui/icon", () => {
	const { createElement } = require("react");
	return {
		Icon: (props: Record<string, unknown>) => createElement("Icon", props),
	};
});

mock.module("@/components/ui/text", () => {
	const { createElement } = require("react");
	return {
		Text: (props: Record<string, unknown>) => createElement("Text", props),
	};
});

mock.module("lucide-react-native", () => ({
	ChevronLeft: "ChevronLeft",
}));

describe("SettingsScreen", () => {
	test("back button navigates to the More menu route instead of using router.back()", async () => {
		// Read the source file and check for the navigation pattern
		const fs = await import("node:fs");
		const path = await import("node:path");

		const sourceFile = path.resolve(import.meta.dir, "SettingsScreen.tsx");
		const source = fs.readFileSync(sourceFile, "utf-8");

		// The back button should NOT use router.back()
		expect(source).not.toContain("router.back()");

		// It should navigate to a fixed route (the parent "more" menu)
		expect(source).toMatch(/router\.(navigate|replace|push)\(\s*["']\//);
	});
});
