import { describe, expect, it } from "bun:test";
import { deriveBranchName } from "./deriveBranchName";

describe("deriveBranchName", () => {
	it("prefers the provider branch name when present", () => {
		expect(
			deriveBranchName({
				slug: "TRA-890",
				title: "Define the multi-agent code review workflow",
				branch: "tra-890-define-the-multi-agent-code-review-workf",
			}),
		).toBe("tra-890-define-the-multi-agent-code-review-workf");
	});

	it("preserves user prefixes and slashes in provider branch names", () => {
		expect(
			deriveBranchName({
				slug: "TRA-890",
				title: "Fix the thing",
				branch: "kietho/tra-890-fix-the-thing",
			}),
		).toBe("kietho/tra-890-fix-the-thing");
	});

	it("falls back to slug + title when branch is missing", () => {
		expect(
			deriveBranchName({ slug: "SUPER-172", title: "Fix the thing" }),
		).toBe("super-172-fix-the-thing");
	});

	it("falls back to slug + title when branch is blank", () => {
		expect(
			deriveBranchName({
				slug: "SUPER-172",
				title: "Fix the thing",
				branch: "  ",
			}),
		).toBe("super-172-fix-the-thing");
	});

	it("returns the slug alone when the title sanitizes to nothing", () => {
		expect(deriveBranchName({ slug: "SUPER-172", title: "???" })).toBe(
			"super-172",
		);
	});
});
