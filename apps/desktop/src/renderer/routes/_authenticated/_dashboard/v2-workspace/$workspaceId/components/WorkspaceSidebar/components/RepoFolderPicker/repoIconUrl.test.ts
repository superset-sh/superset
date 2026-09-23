import { describe, expect, it } from "bun:test";
import { repoIconUrl } from "./repoIconUrl";

describe("a checkout's avatar in the folder picker", () => {
	it("is the GitHub owner's, so a folder reads as the repository it holds", () => {
		expect(repoIconUrl("acme/roster")).toBe(
			"https://github.com/acme.png?size=64",
		);
	});

	it("is none for a checkout with no GitHub remote", () => {
		expect(repoIconUrl(null)).toBeNull();
		expect(repoIconUrl("roster")).toBeNull();
	});
});
