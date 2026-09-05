import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	devAppProfileDirName,
	isDevAppProfileDirName,
	isStrandedDevAppProfile,
	resolveAppDataDir,
} from "./dev-app-profile";

describe("devAppProfileDirName", () => {
	test("matches the name the dev app sets on itself", () => {
		expect(devAppProfileDirName("reap-dev-app-profiles")).toBe(
			"Superset (reap-dev-app-profiles)",
		);
	});

	test("round-trips through the profile-directory test", () => {
		expect(isDevAppProfileDirName(devAppProfileDirName("fix-x-button"))).toBe(
			true,
		);
	});
});

describe("isDevAppProfileDirName", () => {
	test("never claims an installed build's profile", () => {
		expect(isDevAppProfileDirName("Superset")).toBe(false);
		expect(isDevAppProfileDirName("Superset Dev")).toBe(false);
		expect(isDevAppProfileDirName("Superset Canary")).toBe(false);
	});

	test("leaves unrelated application-data directories alone", () => {
		expect(isDevAppProfileDirName("Supersetter")).toBe(false);
		expect(isDevAppProfileDirName("Slack")).toBe(false);
		expect(isDevAppProfileDirName("superset-dev-trampoline")).toBe(false);
		expect(isDevAppProfileDirName("Superset Dev (fix-protocol)")).toBe(false);
	});

	test("claims truncated profiles from workspace names with stray characters", () => {
		// Real directories on a developer machine: the workspace name carried a
		// newline, so the profile has no closing paren but is just as stranded.
		expect(isDevAppProfileDirName("Superset (satyapatel@satyas-mbp:~")).toBe(
			true,
		);
		expect(isDevAppProfileDirName("Superset (saddlepaddle")).toBe(true);
	});

	test("rejects anything that is not a single path segment", () => {
		expect(isDevAppProfileDirName("Superset (../../../etc)")).toBe(false);
		expect(isDevAppProfileDirName("Superset (a/b)")).toBe(false);
		expect(isDevAppProfileDirName("Superset (a\\b)")).toBe(false);
	});
});

describe("resolveAppDataDir", () => {
	test("resolves Electron's appData path per platform", () => {
		expect(
			resolveAppDataDir({ platform: "darwin", homeDir: "/Users/dev", env: {} }),
		).toBe("/Users/dev/Library/Application Support");
		expect(
			resolveAppDataDir({ platform: "linux", homeDir: "/home/dev", env: {} }),
		).toBe("/home/dev/.config");
		expect(
			resolveAppDataDir({
				platform: "linux",
				homeDir: "/home/dev",
				env: { XDG_CONFIG_HOME: "/home/dev/cfg" },
			}),
		).toBe("/home/dev/cfg");
		// An empty variable is unset — letting "" through would make the
		// caller's path.join resolve relative to its working directory.
		expect(
			resolveAppDataDir({
				platform: "linux",
				homeDir: "/home/dev",
				env: { XDG_CONFIG_HOME: "" },
			}),
		).toBe("/home/dev/.config");
		// Separator-agnostic: node:path joins with "/" on a posix test host.
		expect(
			resolveAppDataDir({
				platform: "win32",
				homeDir: "C:\\Users\\dev",
				env: { APPDATA: "" },
			}),
		).toBe(join("C:\\Users\\dev", "AppData", "Roaming"));
		expect(
			resolveAppDataDir({
				platform: "win32",
				homeDir: "C:\\Users\\dev",
				env: { APPDATA: "C:\\Users\\dev\\AppData\\Roaming" },
			}),
		).toBe("C:\\Users\\dev\\AppData\\Roaming");
	});
});

describe("isStrandedDevAppProfile", () => {
	const DAY_MS = 24 * 60 * 60 * 1000;
	const NOW = Date.UTC(2026, 8, 4);

	function check(
		name: string,
		ageDays: number,
		currentProfile = "Superset (a)",
	): boolean {
		return isStrandedDevAppProfile({
			name,
			currentProfile,
			mtimeMs: NOW - ageDays * DAY_MS,
			now: NOW,
		});
	}

	test("reclaims a workspace profile untouched past the threshold", () => {
		expect(check("Superset (fix-x-button)", 15)).toBe(true);
		expect(check("Superset (fix-x-button)", 200)).toBe(true);
	});

	test("keeps a profile inside the threshold", () => {
		expect(check("Superset (fix-x-button)", 13)).toBe(false);
		expect(check("Superset (fix-x-button)", 0)).toBe(false);
	});

	test("holds the boundary at 14 days", () => {
		expect(check("Superset (fix-x-button)", 14)).toBe(true);
		expect(check("Superset (fix-x-button)", 13.99)).toBe(false);
	});

	test("never reclaims an installed build's profile, however old", () => {
		expect(check("Superset", 400)).toBe(false);
		expect(check("Superset Dev", 400)).toBe(false);
		expect(check("Superset Canary", 400)).toBe(false);
	});

	test("leaves other applications' data directories alone", () => {
		expect(check("Slack", 400)).toBe(false);
		expect(check("superset-dev-trampoline", 400)).toBe(false);
		expect(check("Supersetter", 400)).toBe(false);
	});

	test("never reclaims the profile the running app is using", () => {
		expect(check("Superset (a)", 400)).toBe(false);
		expect(check("Superset (a)", 400, "Superset (b)")).toBe(true);
	});
});
