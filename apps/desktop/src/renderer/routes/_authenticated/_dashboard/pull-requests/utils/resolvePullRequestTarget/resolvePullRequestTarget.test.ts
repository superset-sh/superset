import { expect, test } from "bun:test";
import { resolvePullRequestTarget } from "./resolvePullRequestTarget";

const projects = [
	{ id: "project", projectKey: "key", repoOwner: "owner", repoName: "repo" },
];

test("repository identity does not require a project", () => {
	expect(
		resolvePullRequestTarget({
			projectId: null,
			repoFullName: "other/repo",
			projects,
		}),
	).toEqual({ projectId: null, repoFullName: "other/repo" });
});
test("unrelated or removed projects cannot grant project actions", () => {
	for (const projectId of ["project", "removed"]) {
		expect(
			resolvePullRequestTarget({
				projectId,
				repoFullName: "other/repo",
				projects,
			}),
		).toEqual({ projectId: null, repoFullName: "other/repo" });
	}
});
test("legacy project-only links resolve through either project identifier", () => {
	for (const projectId of ["project", "key"])
		expect(resolvePullRequestTarget({ projectId, projects })).toEqual({
			projectId,
			repoFullName: "owner/repo",
		});
});
test("matching repositories retain project actions regardless of casing", () => {
	expect(
		resolvePullRequestTarget({
			projectId: "project",
			repoFullName: "OWNER/Repo",
			projects,
		}),
	).toEqual({ projectId: "project", repoFullName: "OWNER/Repo" });
});
test("a PR number alone cannot identify a repository", () => {
	expect(resolvePullRequestTarget({ projectId: null, projects })).toEqual({
		projectId: null,
		repoFullName: null,
	});
});

test("legacy project-only links preserve the host path when cached remote metadata is absent", () => {
	expect(
		resolvePullRequestTarget({
			projectId: "project",
			projects: [{ id: "project", projectKey: "key" }],
		}),
	).toEqual({ projectId: "project", repoFullName: null });
});
test("an explicit repository cannot inherit actions from unknown project metadata", () => {
	expect(
		resolvePullRequestTarget({
			projectId: "project",
			repoFullName: "owner/repo",
			projects: [{ id: "project", projectKey: "key" }],
		}),
	).toEqual({ projectId: null, repoFullName: "owner/repo" });
});
