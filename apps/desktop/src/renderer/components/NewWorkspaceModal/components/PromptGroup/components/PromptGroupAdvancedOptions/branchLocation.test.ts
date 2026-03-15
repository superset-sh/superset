import { describe, expect, test } from "bun:test";
import { getBranchLocationLabel } from "./branchLocation";

describe("getBranchLocationLabel", () => {
	test("returns 'local' for a local-only branch", () => {
		expect(getBranchLocationLabel({ isLocal: true, isRemote: false })).toBe(
			"local",
		);
	});

	test("returns 'remote' for a remote-only branch", () => {
		expect(getBranchLocationLabel({ isLocal: false, isRemote: true })).toBe(
			"remote",
		);
	});

	test("returns null for a branch that exists both locally and remotely", () => {
		expect(
			getBranchLocationLabel({ isLocal: true, isRemote: true }),
		).toBeNull();
	});

	test("returns null when both flags are false", () => {
		expect(
			getBranchLocationLabel({ isLocal: false, isRemote: false }),
		).toBeNull();
	});
});
