import { describe, expect, test } from "bun:test";
import {
	getBranchNameBlur,
	getBranchNameChange,
	sanitizeCustomBranchName,
} from "./branch-name-input";

describe("branch name input", () => {
	test("replaces whitespace while typing without removing unfinished input", () => {
		expect(getBranchNameChange("Feature/My New Branch/")).toEqual({
			branchName: "Feature/My-New-Branch/",
			branchNameEdited: true,
		});
	});
	test("sanitizes on blur while preserving case, slashes, and underscores", () => {
		expect(getBranchNameBlur(" Feature/Fix_Bug?! ")).toEqual({
			branchName: "Feature/Fix_Bug",
		});
	});
	test("clearing or sanitizing to empty restores automatic naming", () => {
		for (const value of ["", "   ", "///?!"]) {
			expect(getBranchNameBlur(value)).toEqual({
				branchName: "",
				branchNameEdited: false,
			});
		}
	});
	test("applies the V1 length limits when submitting without blurring", () => {
		expect(
			sanitizeCustomBranchName(`${"A".repeat(60)}/${"B".repeat(60)}`),
		).toBe(`${"A".repeat(50)}/${"B".repeat(49)}`);
	});
});

test("truncation never leaves a Git-invalid dot or lock suffix", () => {
	for (const input of [
		`${"a".repeat(49)}.extra`,
		`${"a".repeat(45)}.lockextra`,
		`Feature/${"a".repeat(49)}.extra/Next`,
		`${"a".repeat(50)}/${"b".repeat(48)}.extra`,
		"Feature/foo.lock.lock",
	]) {
		const result = sanitizeCustomBranchName(input);
		for (const segment of result.split("/")) {
			expect(segment.endsWith(".")).toBe(false);
			expect(segment.endsWith(".lock")).toBe(false);
		}
		expect(sanitizeCustomBranchName(result)).toBe(result);
	}
});
