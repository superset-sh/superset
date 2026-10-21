import { describe, expect, test } from "bun:test";
import {
	draftLinkedContext,
	linkedContextSeed,
	linkedIssueChip,
	linkedPrChip,
	linkedRefFromText,
} from "./linkedContextChips";

const linear = {
	slug: "SUP-12",
	title: "Mic on the wrong side",
	source: "linear" as const,
	url: "https://linear.app/superset/issue/SUP-12",
};
const pr = {
	prNumber: 7,
	title: "fix mic",
	url: "https://github.com/o/r/pull/7",
	state: "open",
};

describe("linked context chips", () => {
	test("chips read back as the issues and PR they carry", () => {
		const segments = [
			...linkedContextSeed([linkedIssueChip(linear, true), linkedPrChip(pr)]),
			{ type: "text" as const, text: "please" },
		];
		expect(draftLinkedContext(segments)).toEqual({ issues: [linear], pr });
	});

	test("a repeated issue counts once and the first PR wins", () => {
		const segments = linkedContextSeed([
			linkedIssueChip(linear, true),
			linkedIssueChip(linear, true),
			linkedPrChip(pr),
			linkedPrChip({ ...pr, prNumber: 8 }),
		]);
		const context = draftLinkedContext(segments);
		expect(context.issues).toHaveLength(1);
		expect(context.pr?.prNumber).toBe(7);
	});

	test("chips without linked data are ignored", () => {
		expect(
			draftLinkedContext([
				{ type: "chip", chip: { label: "Linear", serialized: "@linear" } },
			]),
		).toEqual({ issues: [], pr: null });
	});

	test("an issue without a url serializes to its slug", () => {
		expect(
			linkedIssueChip({ slug: "SUP-3", title: "t", source: "internal" }, true)
				.serialized,
		).toBe("@SUP-3");
	});

	test("a pasted link resolves to the item it points at", () => {
		expect(
			linkedRefFromText(
				"https://linear.app/superset-sh/issue/SUPER-2788/chat-configuration-changes",
			),
		).toEqual({ kind: "linear", identifier: "SUPER-2788" });
		expect(
			linkedRefFromText("https://github.com/superset-sh/superset/pull/8085"),
		).toEqual({ kind: "github-pr", number: 8085 });
		expect(
			linkedRefFromText("https://github.com/superset-sh/superset/issues/42"),
		).toEqual({ kind: "github-issue", number: 42 });
		expect(linkedRefFromText("fix the mic")).toBeNull();
	});
});
