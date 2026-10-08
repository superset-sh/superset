import { describe, expect, test } from "bun:test";
import { pageLinkFinder } from "../../../../utils/pageLinks";
import { planMarkdown } from "../planMarkdown";
import { pageLinksByBlock } from "./pageLinksByBlock";

const WEB_URL = "https://app.superset.sh";
const REPORT = `${WEB_URL}/page/quarterly-report-a3f9k`;
const PLAN = `${WEB_URL}/page/launch-plan-b7c2d`;
const find = pageLinkFinder(WEB_URL);

function slugsByBlock(
	blocks: readonly string[],
	alreadyShown: readonly string[] = [],
): string[][] {
	return pageLinksByBlock(blocks, alreadyShown, find).map((links) =>
		links.map((link) => link.slug),
	);
}

describe("pageLinksByBlock", () => {
	test("gives a page to the first block that links it", () => {
		expect(
			slugsByBlock([
				`The report is at ${REPORT}.\n\n`,
				"Nothing here.\n\n",
				`Again: ${REPORT}, and the plan: ${PLAN}`,
			]),
		).toEqual([["quarterly-report-a3f9k"], [], ["launch-plan-b7c2d"]]);
	});

	test("skips a page the turn already shows", () => {
		expect(
			slugsByBlock([`${REPORT} and ${PLAN}`], ["quarterly-report-a3f9k"]),
		).toEqual([["launch-plan-b7c2d"]]);
	});

	test("a link still being streamed is in no settled block", () => {
		const settledSlugs = (text: string) =>
			slugsByBlock(
				planMarkdown(text).stable.map((entry) => entry.block),
			).flat();

		expect(
			settledSlugs(`Published.\n\nHere is the page: ${REPORT.slice(0, -4)}`),
		).toEqual([]);
		expect(settledSlugs(`Here is the page: ${REPORT}`)).toEqual([]);
		expect(
			settledSlugs(`Here is the page: ${REPORT}\n\nAnything else?`),
		).toEqual(["quarterly-report-a3f9k"]);
	});
});
