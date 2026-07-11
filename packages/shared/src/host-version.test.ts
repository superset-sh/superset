import { describe, expect, test } from "bun:test";
import {
	compareHostVersions,
	isHostVersionAtLeast,
	isInstallableHostVersion,
} from "./host-version";

describe("isInstallableHostVersion", () => {
	test.each([
		"1.14.0",
		"1.14.0-2",
		"1.14.0-canary.3",
	])("accepts %s", (version) => {
		expect(isInstallableHostVersion(version)).toBe(true);
	});

	test("caps versions at 64 characters", () => {
		expect(isInstallableHostVersion(`1.2.3-${"a".repeat(58)}`)).toBe(true);
		expect(isInstallableHostVersion(`1.2.3-${"a".repeat(59)}`)).toBe(false);
	});

	test.each([
		"cli-v1.14.0",
		"01.14.0",
		"1.014.0",
		"1.14.00",
		"1.14.0-02",
		"1.14.0-rc..1",
		"1.14.0-rc-1",
		"1.14.0+build.1",
		" 1.14.0",
	])("rejects %s", (version) => {
		expect(isInstallableHostVersion(version)).toBe(false);
	});
});

describe("compareHostVersions", () => {
	test("orders numeric hotfixes after their stable core", () => {
		expect(compareHostVersions("1.14.0", "1.14.0-0")).toBe(-1);
		expect(compareHostVersions("1.14.0-2", "1.14.0-1")).toBe(1);
		expect(compareHostVersions("1.14.0-10", "1.14.0-9")).toBe(1);
	});

	test("orders release cores before applying hotfix semantics", () => {
		expect(compareHostVersions("1.15.0", "1.14.0-999")).toBe(1);
		expect(compareHostVersions("2.0.0", "1.999.999-999")).toBe(1);
		expect(compareHostVersions("1.13.999-999", "1.14.0")).toBe(-1);
	});

	test("retains SemVer ordering for non-hotfix prereleases", () => {
		expect(compareHostVersions("1.14.0-rc.2", "1.14.0-rc.1")).toBe(1);
		expect(compareHostVersions("1.14.0-rc.1", "1.14.0")).toBe(-1);
	});

	test("returns null for non-installable versions", () => {
		expect(compareHostVersions("dev", "1.14.0")).toBeNull();
		expect(compareHostVersions("1.14.0", "1.14.0+build.1")).toBeNull();
	});
});

describe("isHostVersionAtLeast", () => {
	test("uses publication ordering and rejects invalid versions", () => {
		expect(isHostVersionAtLeast("1.14.0-1", "1.14.0")).toBe(true);
		expect(isHostVersionAtLeast("1.14.0", "1.14.0-1")).toBe(false);
		expect(isHostVersionAtLeast("dev", "1.14.0")).toBe(false);
	});
});
