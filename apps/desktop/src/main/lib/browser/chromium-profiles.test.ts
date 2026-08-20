import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	browserLocations,
	getInstalledChromiumBrowsers,
	listProfilesWithHistory,
} from "./chromium-profiles";

// Derive Chrome's user-data path from the implementation so these tests pass on
// whichever platform CI runs (macOS locally, Linux in CI), not just darwin.
const CHROME_REL = browserLocations(process.platform).find(
	(location) => location.key === "chrome",
)?.relativePath as string;

const tempHomes: string[] = [];

function makeHome(): string {
	const home = mkdtempSync(path.join(tmpdir(), "chromium-profiles-test-"));
	tempHomes.push(home);
	return home;
}

function writeHistory(profileDir: string): void {
	mkdirSync(profileDir, { recursive: true });
	writeFileSync(path.join(profileDir, "History"), "");
}

afterEach(() => {
	while (tempHomes.length > 0) {
		rmSync(tempHomes.pop() as string, { recursive: true, force: true });
	}
});

describe("getInstalledChromiumBrowsers", () => {
	it("detects a browser only when its user-data dir exists", () => {
		const home = makeHome();
		mkdirSync(path.join(home, CHROME_REL), { recursive: true });

		const browsers = getInstalledChromiumBrowsers(home);

		expect(browsers.map((browser) => browser.key)).toEqual(["chrome"]);
		expect(browsers[0]?.name).toBe("Google Chrome");
	});

	it("returns nothing when no Chromium browser is installed", () => {
		expect(getInstalledChromiumBrowsers(makeHome())).toEqual([]);
	});
});

describe("listProfilesWithHistory", () => {
	it("lists only directories that contain a History file", () => {
		const home = makeHome();
		const userDataDir = path.join(home, CHROME_REL);
		writeHistory(path.join(userDataDir, "Default"));
		writeHistory(path.join(userDataDir, "Profile 1"));
		// A directory with no History file must be ignored.
		mkdirSync(path.join(userDataDir, "System Profile"), { recursive: true });

		const browser = getInstalledChromiumBrowsers(home)[0];
		expect(browser).toBeDefined();

		const profiles = listProfilesWithHistory(browser as never);

		expect(profiles.map((profile) => profile.directoryName).sort()).toEqual([
			"Default",
			"Profile 1",
		]);
	});

	it("uses display names from Local State when present", () => {
		const home = makeHome();
		const userDataDir = path.join(home, CHROME_REL);
		writeHistory(path.join(userDataDir, "Profile 1"));
		writeFileSync(
			path.join(userDataDir, "Local State"),
			JSON.stringify({
				profile: { info_cache: { "Profile 1": { name: "Work" } } },
			}),
		);

		const browser = getInstalledChromiumBrowsers(home)[0];
		const profiles = listProfilesWithHistory(browser as never);

		expect(profiles[0]?.displayName).toBe("Work");
	});

	it("excludes Chrome's built-in System and Guest profiles", () => {
		const home = makeHome();
		const userDataDir = path.join(home, CHROME_REL);
		writeHistory(path.join(userDataDir, "Default"));
		writeHistory(path.join(userDataDir, "System Profile"));
		writeHistory(path.join(userDataDir, "Guest Profile"));

		const browser = getInstalledChromiumBrowsers(home)[0];
		const profiles = listProfilesWithHistory(browser as never);

		expect(profiles.map((profile) => profile.directoryName)).toEqual([
			"Default",
		]);
	});

	it("excludes internal profiles marked with a __ display name", () => {
		const home = makeHome();
		const userDataDir = path.join(home, CHROME_REL);
		writeHistory(path.join(userDataDir, "Default"));
		writeHistory(path.join(userDataDir, "Profile 1"));
		writeFileSync(
			path.join(userDataDir, "Local State"),
			JSON.stringify({
				profile: {
					info_cache: { "Profile 1": { name: "__ARC_SYSTEM_PROFILE" } },
				},
			}),
		);

		const browser = getInstalledChromiumBrowsers(home)[0];
		const profiles = listProfilesWithHistory(browser as never);

		expect(profiles.map((profile) => profile.directoryName)).toEqual([
			"Default",
		]);
	});

	it("falls back to the directory name without Local State", () => {
		const home = makeHome();
		writeHistory(path.join(home, CHROME_REL, "Default"));

		const browser = getInstalledChromiumBrowsers(home)[0];
		const profiles = listProfilesWithHistory(browser as never);

		expect(profiles[0]?.displayName).toBe("Default");
	});
});
