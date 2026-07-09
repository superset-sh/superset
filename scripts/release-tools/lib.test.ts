import { describe, expect, test } from "bun:test";
import {
	incrementPatch,
	isPlainRelease,
	latestReleaseTag,
	nextInterimVersion,
	unifiedErrors,
} from "./lib.ts";

describe("nextInterimVersion", () => {
	test("plain desktop -> -1", () => {
		expect(nextInterimVersion("1.14.0", "1.14.0")).toBe("1.14.0-1");
	});
	test("continues the suffix", () => {
		expect(nextInterimVersion("1.14.0", "1.14.0-2")).toBe("1.14.0-3");
		expect(nextInterimVersion("1.14.0", "1.14.0-9")).toBe("1.14.0-10");
	});
	test("resets to -1 when base is stale (new ceiling)", () => {
		expect(nextInterimVersion("1.15.0", "1.14.0-3")).toBe("1.15.0-1");
	});
	test("legacy independent version -> -1", () => {
		expect(nextInterimVersion("1.14.0", "0.2.24")).toBe("1.14.0-1");
	});
	test("forceSuffix overrides", () => {
		expect(nextInterimVersion("1.14.0", "1.14.0-2", 7)).toBe("1.14.0-7");
	});
});

describe("unifiedErrors", () => {
	const ok = (d: string, vs: string[]) =>
		unifiedErrors(
			d,
			vs.map((v, i) => ({ name: `p${i}`, version: v })),
		);
	test("all equal to desktop -> no errors", () => {
		expect(ok("1.14.0", ["1.14.0", "1.14.0"])).toEqual([]);
	});
	test("interim prerelease shared base -> no errors", () => {
		expect(ok("1.14.0", ["1.14.0-1", "1.14.0-1"])).toEqual([]);
	});
	test("base mismatch flagged", () => {
		expect(ok("1.14.0", ["1.15.0-1", "1.14.0"]).length).toBeGreaterThan(0);
	});
	test("packages disagree -> flagged", () => {
		expect(ok("1.14.0", ["1.14.0-1", "1.14.0-2"]).length).toBeGreaterThan(0);
	});
	test("desktop must be a plain release", () => {
		expect(ok("1.14.0-1", ["1.14.0-1"]).length).toBeGreaterThan(0);
	});
});

describe("latestReleaseTag", () => {
	test("ignores malformed historical tags and picks newest", () => {
		const tags = [
			"desktop-vdesktop-v0.0.14",
			"desktop-v1.13.1",
			"desktop-v1.14.0",
			"desktop-vdesktop-0.0.33",
		];
		expect(latestReleaseTag(tags, "desktop")).toBe("desktop-v1.14.0");
	});
	test("cli prerelease ordering (release > prerelease)", () => {
		expect(latestReleaseTag(["cli-v1.14.0-1", "cli-v0.2.24"], "cli")).toBe(
			"cli-v1.14.0-1",
		);
		expect(
			latestReleaseTag(["cli-v1.14.0-1", "cli-v1.14.0-2"], "cli"),
		).toBe("cli-v1.14.0-2");
	});
	test("no matching tags -> undefined", () => {
		expect(latestReleaseTag(["random", "v1.0.0"], "cli")).toBeUndefined();
	});
});

describe("helpers", () => {
	test("isPlainRelease", () => {
		expect(isPlainRelease("1.14.0")).toBe(true);
		expect(isPlainRelease("1.14.0-1")).toBe(false);
	});
	test("incrementPatch", () => {
		expect(incrementPatch("0.2.5")).toBe("0.2.6");
	});
});
