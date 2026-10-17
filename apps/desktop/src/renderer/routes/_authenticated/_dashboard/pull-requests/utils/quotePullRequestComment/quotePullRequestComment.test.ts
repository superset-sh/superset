import { describe, expect, test } from "bun:test";
import {
	appendQuoteToDraft,
	quotePullRequestComment,
} from "./quotePullRequestComment";

describe("quoting a conversation comment for a reply", () => {
	test("a selection is quoted whole, line by line, as one blockquote", () => {
		expect(
			quotePullRequestComment({
				selection: "\nRename the hook.\n\n\n  keep the indent  \n",
				text: "The whole comment",
			}),
		).toBe("> Rename the hook.\n>\n>   keep the indent");
	});

	test("without a selection the comment's opening lines are quoted, marked where they are cut", () => {
		expect(
			quotePullRequestComment({
				selection: "",
				text: "One\n\nTwo\tcells\n\nThree\nFour\nFive",
			}),
		).toBe("> One\n> Two cells\n> Three\n> Four…");
		const long = quotePullRequestComment({
			selection: "  ",
			text: `Short line\n${"word ".repeat(100)}`,
		});
		expect(long.split("\n")).toHaveLength(2);
		expect(long.endsWith("…")).toBe(true);
		expect(long.length).toBeLessThan(340);
	});

	test("a short comment is quoted in full with no cut mark", () => {
		expect(quotePullRequestComment({ selection: "", text: "LGTM" })).toBe(
			"> LGTM",
		);
		expect(quotePullRequestComment({ selection: "", text: " \n " })).toBe("");
	});

	test("the quote goes after what is already written and leaves a line to type on", () => {
		expect(appendQuoteToDraft("", "> LGTM")).toBe("> LGTM\n\n");
		expect(appendQuoteToDraft("Half a thought \n", "> LGTM")).toBe(
			"Half a thought\n\n> LGTM\n\n",
		);
		expect(appendQuoteToDraft("Half a thought", "")).toBe("Half a thought");
	});
});
