import { expect, test } from "bun:test";
import type { LinkedIssue } from "renderer/stores/new-workspace-draft";
import { getGitLabIssueTargetMismatch } from "./gitlab-issue-target";

const issue: LinkedIssue = {
	slug: "gitlab-issue-42",
	title: "Fix issue",
	source: "gitlab",
	number: 42,
	projectId: "project-a",
	hostId: "host-a",
	instance: "https://gitlab.example.com",
	repoPath: "group/repo",
	url: "https://gitlab.example.com/group/repo/-/issues/42",
};

test("accepts GitLab issues from the selected host and project", () => {
	expect(
		getGitLabIssueTargetMismatch([issue], "project-a", "host-a", "host-a"),
	).toBeNull();
	expect(
		getGitLabIssueTargetMismatch(
			[issue, { ...issue, number: 43 }],
			"project-a",
			"host-a",
			"host-a",
		),
	).toBeNull();
	expect(
		getGitLabIssueTargetMismatch(
			[{ ...issue, hostId: undefined }],
			"project-a",
			"host-a",
			"host-a",
		),
	).toBeNull();
});

test("blocks cross-project, cross-host, and cross-instance issues", () => {
	expect(
		getGitLabIssueTargetMismatch([issue], "project-b", "host-a", "host-a"),
	).toBe("project");
	expect(
		getGitLabIssueTargetMismatch([issue], "project-a", "host-b", "host-a"),
	).toBe("host");
	expect(
		getGitLabIssueTargetMismatch(
			[issue, { ...issue, instance: "https://other.example.com" }],
			"project-a",
			"host-a",
			"host-a",
		),
	).toBe("repository");
	expect(
		getGitLabIssueTargetMismatch(
			[{ ...issue, url: undefined }],
			"project-a",
			"host-a",
			"host-a",
		),
	).toBe("repository");
	expect(
		getGitLabIssueTargetMismatch(
			[{ ...issue, repoPath: undefined }],
			"project-a",
			"host-a",
			"host-a",
		),
	).toBe("repository");
});

test("does not constrain existing GitHub or internal linked issues", () => {
	expect(
		getGitLabIssueTargetMismatch(
			[{ ...issue, source: "github" }],
			"project-b",
			"host-b",
			"host-a",
		),
	).toBeNull();
});
