import { afterEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	isPatchedDesktopBuild,
	resetPatchedBrowserStateIfNeeded,
} from "./app-environment";

describe("app-environment patched browser state reset", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs) {
			rmSync(dir, { recursive: true, force: true });
		}
		tempDirs.length = 0;
	});

	it("detects patched desktop builds from the app bundle path", () => {
		expect(
			isPatchedDesktopBuild(
				"/Applications/Superset Patched.app/Contents/MacOS/Superset Patched",
			),
		).toBe(true);
		expect(
			isPatchedDesktopBuild(
				"/Applications/Superset.app/Contents/MacOS/Superset",
			),
		).toBe(false);
	});

	it("clears browser-only persisted state once for patched builds", () => {
		const homeDir = mkdtempSync("/tmp/superset-patched-browser-reset-");
		tempDirs.push(homeDir);
		mkdirSync(join(homeDir, "Local Storage"), { recursive: true });
		mkdirSync(join(homeDir, "Partitions"), { recursive: true });
		writeFileSync(join(homeDir, "Preferences"), '{"foo":true}', "utf8");
		writeFileSync(join(homeDir, "app-state.json"), '{"tabsState":{}}', "utf8");

		resetPatchedBrowserStateIfNeeded(
			homeDir,
			"/Applications/Superset Patched.app/Contents/MacOS/Superset Patched",
		);

		expect(existsSync(join(homeDir, "Local Storage"))).toBe(false);
		expect(existsSync(join(homeDir, "Partitions"))).toBe(false);
		expect(existsSync(join(homeDir, "Preferences"))).toBe(false);
		expect(existsSync(join(homeDir, "app-state.json"))).toBe(true);
		expect(
			readFileSync(join(homeDir, ".patched-browser-state-reset-v1"), "utf8")
				.length,
		).toBeGreaterThan(0);
	});
});
