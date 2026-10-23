import { describe, expect, it, mock } from "bun:test";
import type { LinkAction } from "renderer/lib/clickPolicy";
import { openPullRequestLink } from "./openPullRequestLink";

const PR_URL = "https://github.com/superset-sh/superset/pull/8472";
const PR_REF = { repoFullName: "superset-sh/superset", number: 8472 };

function open(url: string, action: LinkAction | null) {
	const openPane = mock();
	const openInBrowser = mock();
	openPullRequestLink(url, action, openPane, openInBrowser);
	return { openPane, openInBrowser };
}

describe("openPullRequestLink", () => {
	it("opens a URL that is not a pull request in the browser", () => {
		const url = "https://gitlab.com/acme/app/-/issues/3";
		const { openPane, openInBrowser } = open(url, "pane");
		expect(openInBrowser).toHaveBeenCalledWith(url);
		expect(openPane).not.toHaveBeenCalled();
	});

	it("opens the pull request in the browser for the external action", () => {
		const { openPane, openInBrowser } = open(PR_URL, "external");
		expect(openInBrowser).toHaveBeenCalledWith(PR_URL);
		expect(openPane).not.toHaveBeenCalled();
	});

	it("splits the pull request pane for the pane action", () => {
		const { openPane, openInBrowser } = open(PR_URL, "pane");
		expect(openPane).toHaveBeenCalledWith(PR_REF, "split");
		expect(openInBrowser).not.toHaveBeenCalled();
	});

	it("opens the pull request pane in a new tab for the newTab action", () => {
		const { openPane, openInBrowser } = open(PR_URL, "newTab");
		expect(openPane).toHaveBeenCalledWith(PR_REF, "tab");
		expect(openInBrowser).not.toHaveBeenCalled();
	});

	it("splits the pull request pane for a GitLab merge request", () => {
		const url = "https://gitlab.com/acme/sub/app/-/merge_requests/3";
		const { openPane } = open(url, "pane");
		const ref = { repoFullName: "gitlab.com/acme/sub/app", number: 3 };
		expect(openPane).toHaveBeenCalledWith(ref, "split");
	});

	it("falls back to the split pane for an unbound tier", () => {
		const { openPane, openInBrowser } = open(PR_URL, null);
		expect(openPane).toHaveBeenCalledWith(PR_REF, "split");
		expect(openInBrowser).not.toHaveBeenCalled();
	});
});
