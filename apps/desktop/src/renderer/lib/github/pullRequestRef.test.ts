import { expect, test } from "bun:test";
import { isSamePullRequest, pullRequestRefFromUrl } from "./pullRequestRef";

test("GitLab references retain subgroups and distinguish hosts", () => {
	const ref = pullRequestRefFromUrl(
		"https://gitlab.example.com/group/subgroup/app/-/merge_requests/42?tab=diffs",
	);
	expect(ref).toEqual({
		repoFullName: "group/subgroup/app",
		host: "gitlab.example.com",
		number: 42,
	});
	if (!ref) throw new Error("GitLab URL was not parsed");
	expect(isSamePullRequest(ref, { ...ref, host: "other.example.com" })).toBe(
		false,
	);
	expect(isSamePullRequest(ref, { ...ref, host: "GITLAB.EXAMPLE.COM" })).toBe(
		true,
	);
	expect(
		pullRequestRefFromUrl(
			"https://gitlab.example.com/group/app/-/merge_requests/42oops",
		),
	).toBeNull();
	expect(
		pullRequestRefFromUrl(
			"http://gitlab.example.com/group/app/-/merge_requests/42",
		),
	).toBeNull();
	expect(pullRequestRefFromUrl("https://github.com/group/app/pull/42")).toEqual(
		{ repoFullName: "group/app", number: 42 },
	);
});
