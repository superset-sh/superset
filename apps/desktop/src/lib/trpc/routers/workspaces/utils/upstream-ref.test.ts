import { describe, expect, test } from "bun:test";
import { parseUpstreamRef, resolveTrackingRemoteName } from "./upstream-ref";

describe("upstream-ref", () => {
	test("parses upstream refs with slashes in branch names", () => {
		expect(parseUpstreamRef("kitenite/kitenite/halved-position")).toEqual({
			remoteName: "kitenite",
			branchName: "kitenite/halved-position",
		});
	});

	test("returns null for invalid upstream refs", () => {
		expect(parseUpstreamRef("")).toBeNull();
		expect(parseUpstreamRef("no-slash")).toBeNull();
		expect(parseUpstreamRef("/leading-slash")).toBeNull();
		expect(parseUpstreamRef("trailing/")).toBeNull();
	});

	test("resolves the tracking remote from upstream refs", () => {
		expect(resolveTrackingRemoteName("contributor-fork/feature-branch")).toBe(
			"contributor-fork",
		);
		expect(resolveTrackingRemoteName(" origin/main ")).toBe("origin");
	});

	test("falls back to origin when no upstream is configured", () => {
		expect(resolveTrackingRemoteName("")).toBe("origin");
		expect(resolveTrackingRemoteName(null)).toBe("origin");
		expect(resolveTrackingRemoteName(undefined)).toBe("origin");
	});
});
