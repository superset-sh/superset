import { expect, test } from "bun:test";
import {
	gitLabIssuePromptKey,
	linkedIssueFromGitLab,
	parseGitLabIssueUrl,
} from "./linkedIssueFromGitLab";

const url = "https://git.example:8443/Group/Sub/Repo/-/issues/7";
const row = {
	projectId: "p",
	hostId: "h",
	hostUrl: "https://relay.example/h",
	issueNumber: 7,
	title: "Native",
	url,
	state: "opened",
};
test("native issue reference retains nested path case and serving identity", () => {
	const linked = linkedIssueFromGitLab(row);
	expect(linked?.gitlab).toEqual({
		projectId: "p",
		hostId: "h",
		hostUrl: row.hostUrl,
		issueNumber: 7,
		host: "git.example:8443",
		owner: "Group/Sub",
		repo: "Repo",
		expectedIssueUrl: url,
	});
});
test.each([
	"https://@git.example:8443/Group/Sub/Repo/-/issues/7",
	"https://git%2eexample:8443/Group/Sub/Repo/-/issues/7",
	"https://git.example:8443/Group/../Repo/-/issues/7",
	"https://git.example:8443/Group%2fSub/Repo/-/issues/7",
	"https://git.example:8443/Group%252fSub/Repo/-/issues/7",
	"https://git.example:8443/Group/Sub/Repo/-/issues/9007199254740993",
	"https://git.example:8443/Group/Sub/Repo/-/merge_requests/7",
	"https://git.example:8443/Group/Sub/Repo/-/issues/7#note",
])("unsafe native URL refuses %s", (raw) =>
	expect(parseGitLabIssueUrl(raw)).toBeNull());
test("same IID on different instances/projects/serving hosts cannot share a prompt key", () => {
	const linked = required(linkedIssueFromGitLab(row));
	const target = {
		organizationId: "o",
		projectId: "p",
		hostId: "h",
		hostUrl: row.hostUrl,
	};
	const key = gitLabIssuePromptKey(linked, target);
	expect(key).toBeTruthy();
	expect(
		gitLabIssuePromptKey(linked, { ...target, organizationId: "other" }),
	).not.toBe(key);
	expect(
		gitLabIssuePromptKey(linked, {
			...target,
			hostUrl: "https://relay.example/new",
		}),
	).not.toBe(key);
	expect(
		gitLabIssuePromptKey(linked, { ...target, hostId: "other" }),
	).toBeNull();
	expect(
		gitLabIssuePromptKey(linked, { ...target, projectId: "other" }),
	).toBeNull();
	const other = required(
		linkedIssueFromGitLab({
			...row,
			url: url.replace("git.example", "other.example"),
		}),
	);
	expect(other.slug).not.toBe(linked.slug);
	expect(gitLabIssuePromptKey(other, target)).not.toBe(key);
	expect(
		gitLabIssuePromptKey(
			{ ...linked, gitlab: { ...required(linked.gitlab), owner: "group/Sub" } },
			target,
		),
	).toBeNull();
});
test("encoded non-separator project names retain both decoded identity and browser URL", () => {
	expect(parseGitLabIssueUrl(url.replace("Sub", "%53ub"))).toEqual({
		host: "git.example:8443",
		owner: "Group/Sub",
		repo: "Repo",
		issueNumber: 7,
		expectedIssueUrl: url.replace("Sub", "%53ub"),
	});
	expect(linkedIssueFromGitLab({ ...row, issueNumber: 8 })).toBeNull();
});

function required<T>(value: T | null | undefined): T {
	if (value == null) throw Error("Required fixture value missing");
	return value;
}
