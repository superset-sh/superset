import { describe, expect, test } from "bun:test";
import { linkedIssueFromLinear } from "./linkedIssueFromLinear";

describe("linkedIssueFromLinear", () => {
	test("links by reference with Linear's branch name", () => {
		expect(
			linkedIssueFromLinear({
				identifier: "SUP-12",
				title: "Fix relay",
				url: "https://linear.app/superset/issue/SUP-12",
				branchName: "satya/sup-12-fix-relay",
			}),
		).toEqual({
			slug: "SUP-12",
			title: "Fix relay",
			source: "linear",
			url: "https://linear.app/superset/issue/SUP-12",
			branch: "satya/sup-12-fix-relay",
		});
	});

	test("omits an empty branch name", () => {
		expect(
			linkedIssueFromLinear({
				identifier: "SUP-12",
				title: "Fix relay",
				url: "https://linear.app/superset/issue/SUP-12",
				branchName: "",
			}).branch,
		).toBeUndefined();
	});
});
