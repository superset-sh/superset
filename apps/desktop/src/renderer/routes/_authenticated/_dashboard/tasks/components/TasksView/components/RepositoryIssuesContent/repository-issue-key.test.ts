import { expect, test } from "bun:test";
import { repositoryIssueKey } from "./repository-issue-key";

test("scopes an issue to its host, project, and GitLab instance", () => {
	const issue = {
		provider: "gitlab" as const,
		hostId: "host-a",
		projectId: "project-a",
		instance: "https://gitlab.example.com",
		repoPath: "group/repo",
		issueNumber: 42,
		url: "https://gitlab.example.com/group/repo/-/issues/42",
	};
	const key = repositoryIssueKey(issue);
	expect(repositoryIssueKey({ ...issue, hostId: "host-b" })).not.toBe(key);
	expect(repositoryIssueKey({ ...issue, projectId: "project-b" })).not.toBe(
		key,
	);
	expect(
		repositoryIssueKey({ ...issue, instance: "https://other.example.com" }),
	).not.toBe(key);
	expect(repositoryIssueKey({ ...issue, issueNumber: 43 })).not.toBe(key);
	expect(repositoryIssueKey(issue)).toBe(key);
});
