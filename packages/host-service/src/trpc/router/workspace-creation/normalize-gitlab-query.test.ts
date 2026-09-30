import { describe, expect, test } from "bun:test";
import { normalizeGitLabQuery } from "./normalize-gitlab-query";

const repo = {
	instance: "https://gitlab.example.com:8443",
	repoPath: "group/subgroup/project",
};

describe("normalizeGitLabQuery", () => {
	test("accepts text, #IID, and numeric IID", () => {
		expect(normalizeGitLabQuery(" search words ", repo, "issue")).toEqual({
			query: "search words",
			repoMismatch: false,
			isDirectLookup: false,
		});
		expect(normalizeGitLabQuery("#42", repo, "issue")).toEqual({
			query: "42",
			repoMismatch: false,
			isDirectLookup: true,
		});
		expect(normalizeGitLabQuery("42", repo, "issue").isDirectLookup).toBe(true);
	});

	test("accepts the selected nested project and preserves the port", () => {
		expect(
			normalizeGitLabQuery(
				"https://gitlab.example.com:8443/group/subgroup/project/-/issues/42?view=1",
				repo,
				"issue",
			),
		).toEqual({ query: "42", repoMismatch: false, isDirectLookup: true });
	});

	test("rejects URLs for another instance or project", () => {
		for (const url of [
			"https://gitlab.example.com/group/subgroup/project/-/issues/42",
			"https://gitlab.example.com:8443/group/other/project/-/issues/42",
		]) {
			expect(normalizeGitLabQuery(url, repo, "issue")).toEqual({
				query: "",
				repoMismatch: true,
				isDirectLookup: false,
			});
		}
	});

	test("distinguishes issues and merge requests", () => {
		const url =
			"https://gitlab.example.com:8443/group/subgroup/project/-/merge_requests/9";
		expect(normalizeGitLabQuery(url, repo, "issue")).toEqual({
			query: "",
			repoMismatch: true,
			isDirectLookup: false,
		});
		expect(normalizeGitLabQuery(url, repo, "merge_request")).toEqual({
			query: "9",
			repoMismatch: false,
			isDirectLookup: true,
		});
	});
});
