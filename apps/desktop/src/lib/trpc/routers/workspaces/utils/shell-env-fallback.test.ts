import { describe, expect, test } from "bun:test";
import { augmentPathForMacOS } from "./shell-env";

describe("augmentPathForMacOS", () => {
	test("adds common macOS paths when they are missing", () => {
		const env: Record<string, string> = {
			PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
		};
		augmentPathForMacOS(env, "darwin");

		expect(env.PATH).toContain("/opt/homebrew/bin");
		expect(env.PATH).toContain("/opt/homebrew/sbin");
		expect(env.PATH).toContain("/usr/local/bin");
		expect(env.PATH).toContain("/usr/local/sbin");
		// Original paths should still be present
		expect(env.PATH).toContain("/usr/bin");
		expect(env.PATH).toContain("/bin");
	});

	test("does not duplicate paths already present", () => {
		const env: Record<string, string> = {
			PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
		};
		augmentPathForMacOS(env, "darwin");

		const entries = env.PATH.split(":");
		const homebrewBinCount = entries.filter(
			(entry) => entry === "/opt/homebrew/bin",
		).length;
		expect(homebrewBinCount).toBe(1);
	});

	test("handles empty PATH", () => {
		const env: Record<string, string> = { PATH: "" };
		augmentPathForMacOS(env, "darwin");

		expect(env.PATH).toContain("/opt/homebrew/bin");
		expect(env.PATH).toContain("/usr/local/bin");
	});

	test("handles missing PATH key", () => {
		const env: Record<string, string> = {};
		augmentPathForMacOS(env, "darwin");

		expect(env.PATH).toContain("/opt/homebrew/bin");
		expect(env.PATH).toContain("/usr/local/bin");
	});

	test("matches PATH entries exactly instead of using substrings", () => {
		const env: Record<string, string> = {
			PATH: "/usr/local/bin-tools:/usr/bin:/bin",
		};
		augmentPathForMacOS(env, "darwin");

		expect(env.PATH.split(":")).toContain("/usr/local/bin");
	});

	test("preserves existing PATH separators when nothing needs to be added", () => {
		const originalPath =
			"/opt/homebrew/bin::/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin";
		const env: Record<string, string> = {
			PATH: originalPath,
		};
		augmentPathForMacOS(env, "darwin");

		expect(env.PATH).toBe(originalPath);
	});

	test("adds system paths when PATH has only homebrew paths (issue #2670)", () => {
		// Reproduces: Electron GUI app on macOS where shellEnv() fails and
		// process.env.PATH is empty/undefined, leaving only homebrew paths.
		// Without /usr/bin, `spawn git` fails with ENOENT.
		const env: Record<string, string> = {
			PATH: "/opt/homebrew/bin:/opt/homebrew/sbin",
		};
		augmentPathForMacOS(env, "darwin");

		expect(env.PATH).toContain("/usr/bin");
		expect(env.PATH).toContain("/bin");
		expect(env.PATH).toContain("/usr/sbin");
		expect(env.PATH).toContain("/sbin");
	});

	test("adds system paths when PATH is empty (issue #2670)", () => {
		// Reproduces: macOS Electron app launched from Finder with no PATH at all.
		const env: Record<string, string> = { PATH: "" };
		augmentPathForMacOS(env, "darwin");

		expect(env.PATH).toContain("/usr/bin");
		expect(env.PATH).toContain("/bin");
		expect(env.PATH).toContain("/usr/sbin");
		expect(env.PATH).toContain("/sbin");
	});

	test("does nothing outside macOS", () => {
		const env: Record<string, string> = {
			PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
		};
		augmentPathForMacOS(env, "linux");

		expect(env.PATH).toBe("/usr/bin:/bin:/usr/sbin:/sbin");
	});
});
