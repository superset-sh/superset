import { describe, expect, test } from "bun:test";
import { derivePrLocalBranchName } from "./pr-branch-name";

describe("derivePrLocalBranchName", () => {
	test("same-repo PR returns head ref as-is", () => {
		expect(
			derivePrLocalBranchName({
				headRefName: "fix/typo",
				headRepositoryOwner: "cli",
				isCrossRepository: false,
			}),
		).toBe("fix/typo");
	});

	test("cross-repo PR prefixes with lowercased owner", () => {
		expect(
			derivePrLocalBranchName({
				headRefName: "fix/browse-decimal-short-sha",
				headRepositoryOwner: "lawrence3699",
				isCrossRepository: true,
			}),
		).toBe("lawrence3699/fix/browse-decimal-short-sha");
	});

	test("cross-repo PR lowercases mixed-case owner", () => {
		expect(
			derivePrLocalBranchName({
				headRefName: "feat",
				headRepositoryOwner: "Kietho",
				isCrossRepository: true,
			}),
		).toBe("kietho/feat");
	});

	test("cross-repo PR preserves slashes in head ref", () => {
		expect(
			derivePrLocalBranchName({
				headRefName: "feat/foo/bar",
				headRepositoryOwner: "user",
				isCrossRepository: true,
			}),
		).toBe("user/feat/foo/bar");
	});

	test("same-repo PR ignores owner field", () => {
		expect(
			derivePrLocalBranchName({
				headRefName: "main",
				headRepositoryOwner: "WHATEVER",
				isCrossRepository: false,
			}),
		).toBe("main");
	});

	test("cross-repo PR handles owner with hyphens/numbers", () => {
		expect(
			derivePrLocalBranchName({
				headRefName: "branch",
				headRepositoryOwner: "User-123",
				isCrossRepository: true,
			}),
		).toBe("user-123/branch");
	});

	test("empty headRefName throws", () => {
		expect(() =>
			derivePrLocalBranchName({
				headRefName: "",
				headRepositoryOwner: "user",
				isCrossRepository: false,
			}),
		).toThrow("headRefName is required");
	});

	test("whitespace-only headRefName throws", () => {
		expect(() =>
			derivePrLocalBranchName({
				headRefName: "   ",
				headRepositoryOwner: "user",
				isCrossRepository: true,
			}),
		).toThrow("headRefName is required");
	});

	test("trims surrounding whitespace on headRefName", () => {
		expect(
			derivePrLocalBranchName({
				headRefName: "  fix/foo  ",
				headRepositoryOwner: "user",
				isCrossRepository: true,
			}),
		).toBe("user/fix/foo");
	});

	test("cross-repo with empty owner throws", () => {
		expect(() =>
			derivePrLocalBranchName({
				headRefName: "foo",
				headRepositoryOwner: "",
				isCrossRepository: true,
			}),
		).toThrow("headRepositoryOwner is required");
	});

	test("cross-repo with whitespace-only owner throws", () => {
		expect(() =>
			derivePrLocalBranchName({
				headRefName: "foo",
				headRepositoryOwner: "   ",
				isCrossRepository: true,
			}),
		).toThrow("headRepositoryOwner is required");
	});
});
