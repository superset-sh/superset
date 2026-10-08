import { describe, expect, test } from "bun:test";
import { type ChromeSearch, chromeCandidates, findChrome } from "./findChrome";

function search(overrides: Partial<ChromeSearch>): ChromeSearch {
	return {
		env: {},
		platform: "darwin",
		home: "/Users/ada",
		isExecutable: () => false,
		listDir: () => [],
		...overrides,
	};
}

describe("findChrome", () => {
	test("uses only SUPERSET_CHROME_PATH when it is set", () => {
		expect(
			chromeCandidates(search({ env: { SUPERSET_CHROME_PATH: "/x/chrome" } })),
		).toEqual(["/x/chrome"]);
	});

	test("prefers the newest Playwright browser over system Chrome", () => {
		const found = findChrome(
			search({
				listDir: () => [
					"chromium_headless_shell-1100",
					"chromium_headless_shell-1194",
				],
				isExecutable: () => true,
			}),
		);
		expect(found).toBe(
			"/Users/ada/Library/Caches/ms-playwright/chromium_headless_shell-1194/chrome-mac/headless_shell",
		);
	});

	test("falls back to an installed system browser", () => {
		const chrome =
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
		expect(
			findChrome(search({ isExecutable: (path) => path === chrome })),
		).toBe(chrome);
	});

	test("returns null when nothing is installed", () => {
		expect(findChrome(search({ platform: "linux" }))).toBeNull();
	});
});
