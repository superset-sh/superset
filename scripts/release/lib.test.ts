import { describe, expect, test } from "bun:test";
import {
	incrementPatch,
	isPlainRelease,
	latestReleaseTag,
	maxVersion,
	nextCliHotfix,
	unifiedErrors,
} from "./lib.ts";

describe("nextCliHotfix", () => {
	test("plain patch above the current CLI", () => {
		expect(nextCliHotfix("1.14.1")).toBe("1.14.2");
		expect(nextCliHotfix("1.14.2")).toBe("1.14.3");
		expect(nextCliHotfix("1.14.9")).toBe("1.14.10");
	});
});

describe("maxVersion", () => {
	test("picks the highest by semver", () => {
		expect(maxVersion(["1.14.1", "1.14.0-2", "1.14.1"])).toBe("1.14.1");
		expect(maxVersion(["1.14.2", "1.14.1"])).toBe("1.14.2");
	});
	test("a plain release beats a prerelease of the same tuple", () => {
		expect(maxVersion(["1.14.0-2", "1.14.1"])).toBe("1.14.1");
		expect(maxVersion(["1.14.1-1", "1.14.1"])).toBe("1.14.1");
	});
});

describe("unifiedErrors", () => {
	const check = (d: string, vs: string[]) =>
		unifiedErrors(
			d,
			vs.map((v, i) => ({ name: `p${i}`, version: v })),
		);
	test("release state: cli == host == desktop", () => {
		expect(check("1.14.1", ["1.14.1", "1.14.1"])).toEqual([]);
	});
	test("hotfix leads desktop by a plain patch", () => {
		expect(check("1.14.1", ["1.14.2", "1.14.2"])).toEqual([]);
		expect(check("1.14.1", ["1.14.5", "1.14.5"])).toEqual([]);
	});
	test("rejects a prerelease suffix (fails the host floor)", () => {
		expect(check("1.14.1", ["1.14.2-1", "1.14.2-1"]).length).toBeGreaterThan(0);
	});
	test("rejects cli below desktop", () => {
		expect(check("1.14.1", ["1.14.0", "1.14.0"]).length).toBeGreaterThan(0);
	});
	test("rejects a different minor line", () => {
		expect(check("1.14.1", ["1.15.0", "1.15.0"]).length).toBeGreaterThan(0);
	});
	test("rejects packages that disagree", () => {
		expect(check("1.14.1", ["1.14.2", "1.14.3"]).length).toBeGreaterThan(0);
	});
	test("desktop must be a plain release", () => {
		expect(check("1.14.1-1", ["1.14.1-1"]).length).toBeGreaterThan(0);
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
	test("cli picks the highest (release > prerelease)", () => {
		expect(latestReleaseTag(["cli-v1.14.0-2", "cli-v1.14.1"], "cli")).toBe(
			"cli-v1.14.1",
		);
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
