import { describe, expect, test } from "bun:test";
import { parseGitHubRemote } from "./github-remote";
import { normalizePullRequestIdentity } from "./pull-request";
import {
	parseRepositoryRemote,
	repositoryIdentityKey,
	requestIdentityKey,
} from "./source-control";

describe("repository remote identity", () => {
	test("keeps GitHub HTTPS and SSH behavior", () => {
		for (const remote of [
			"https://github.com/Acme/widgets.git",
			"git@github.com:Acme/widgets.git",
			"ssh://git@github.com/Acme/widgets.git",
			"ssh://git@github.com:2222/Acme/widgets.git",
		]) {
			expect(parseGitHubRemote(remote)).toEqual({
				provider: "github",
				owner: "Acme",
				name: "widgets",
				url: "https://github.com/Acme/widgets",
			});
		}
	});

	test("keeps GitLab nested namespaces and configured instance ports", () => {
		expect(
			parseRepositoryRemote("git@gitlab.com:group/subgroup/repo.git"),
		).toMatchObject({
			provider: "gitlab",
			instance: "https://gitlab.com",
			repoPath: "group/subgroup/repo",
			owner: "group/subgroup",
			name: "repo",
		});
		expect(
			parseRepositoryRemote(
				"ssh://git@gitlab.com:2222/group/subgroup/repo.git",
			),
		).toMatchObject({
			provider: "gitlab",
			instance: "https://gitlab.com",
		});
		expect(
			parseRepositoryRemote(
				"ssh://git@code.example.com:2222/group/subgroup/repo.git",
				{ gitlabHosts: ["https://code.example.com:8443"] },
			),
		).toMatchObject({
			provider: "gitlab",
			instance: "https://code.example.com:8443",
			repoPath: "group/subgroup/repo",
		});
		expect(
			parseRepositoryRemote("https://code.example.com:9443/group/repo", {
				gitlabHosts: ["https://code.example.com:8443"],
			}),
		).toBeNull();
	});

	test("does not classify unknown hosts as GitLab", () => {
		expect(
			parseRepositoryRemote("git@other.example.com:group/repo.git"),
		).toBeNull();
	});

	test("maps only an explicitly configured alternate SSH host to its API instance", () => {
		const options = {
			gitlabHosts: ["https://code.example.com:8443"],
			gitlabSshHosts: [
				{
					sshHost: "ssh.example.com:2222",
					instance: "https://code.example.com:8443",
				},
			],
		};
		expect(
			parseRepositoryRemote(
				"ssh://git@ssh.example.com:2222/team/subgroup/repo.git",
				options,
			),
		).toMatchObject({
			provider: "gitlab",
			instance: "https://code.example.com:8443",
			repoPath: "team/subgroup/repo",
		});
		expect(
			parseRepositoryRemote(
				"ssh://git@ssh.example.com:2223/team/subgroup/repo.git",
				options,
			),
		).toBeNull();
		expect(
			parseRepositoryRemote("git@github.com:Acme/widgets.git", {
				gitlabSshHosts: [
					{ sshHost: "github.com", instance: "https://code.example.com" },
				],
			}),
		).toMatchObject({ provider: "github", instance: "https://github.com" });
		expect(
			parseRepositoryRemote("git@ssh.example.com:team/repo.git", {
				gitlabSshHosts: [
					{ sshHost: "ssh.example.com", instance: "https://github.com" },
				],
			}),
		).toBeNull();
	});

	test("keys isolate provider, instance, repository, kind and IID", () => {
		const first = parseRepositoryRemote("https://one.example.com/group/repo", {
			gitlabHosts: ["one.example.com"],
		});
		const second = parseRepositoryRemote("https://two.example.com/group/repo", {
			gitlabHosts: ["two.example.com"],
		});
		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		if (!first || !second) return;
		expect(repositoryIdentityKey(first)).not.toBe(
			repositoryIdentityKey(second),
		);
		expect(
			requestIdentityKey({ repository: first, kind: "issue", iid: 42 }),
		).not.toBe(
			requestIdentityKey({ repository: first, kind: "merge_request", iid: 42 }),
		);
	});

	test("normalizes older GitHub request details", () => {
		expect(
			normalizePullRequestIdentity({ repoFullName: "Acme/widgets" }),
		).toMatchObject({
			provider: "github",
			instance: "https://github.com",
			repoPath: "Acme/widgets",
		});
	});
});
