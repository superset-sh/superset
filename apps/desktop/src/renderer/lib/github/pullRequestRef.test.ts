import { describe, expect, it } from "bun:test";
import {
	pullRequestRefFromBareUrl,
	pullRequestRefFromUrl,
} from "./pullRequestRef";

const REF = { repoFullName: "superset-sh/superset", number: 8412 };

describe("pullRequestRefFromUrl", () => {
	it("reads the same pull request with or without www", () => {
		expect(
			pullRequestRefFromUrl(
				"https://www.github.com/superset-sh/superset/pull/8412",
			),
		).toEqual(REF);
		expect(
			pullRequestRefFromBareUrl(
				"https://www.github.com/superset-sh/superset/pull/8412",
			),
		).toEqual(REF);
		expect(
			pullRequestRefFromUrl(
				"https://github.com.evil.io/superset-sh/superset/pull/1",
			),
		).toBeNull();
	});
});
