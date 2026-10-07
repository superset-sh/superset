import { describe, expect, it } from "bun:test";
import { repositoryIdentityKey } from "./repo-identity";

const repo = {
	provider: "gitlab" as const,
	host: "a.example",
	owner: "team/sub",
	name: "repo",
};

describe("repository identity", () => {
	it("separates instances with identical repository paths", () => {
		expect(repositoryIdentityKey(repo)).not.toBe(
			repositoryIdentityKey({ ...repo, host: "b.example" }),
		);
	});
	it("separates providers on the same host", () => {
		expect(repositoryIdentityKey(repo)).not.toBe(
			repositoryIdentityKey({ ...repo, provider: "github" }),
		);
	});
	it("preserves non-default HTTPS ports", () => {
		expect(repositoryIdentityKey(repo)).not.toBe(
			repositoryIdentityKey({ ...repo, host: "a.example:8443" }),
		);
	});
	it("ignores host casing", () => {
		expect(repositoryIdentityKey(repo)).toBe(
			repositoryIdentityKey({ ...repo, host: "A.EXAMPLE" }),
		);
	});
	it("retains GitHub's case-insensitive repository lookup", () => {
		const github = {
			...repo,
			provider: "github" as const,
			owner: "Team",
			name: "Repo",
		};
		expect(repositoryIdentityKey(github)).toBe(
			repositoryIdentityKey({ ...github, owner: "team", name: "repo" }),
		);
	});
	it("does not merge distinct namespace and repository boundaries", () => {
		expect(repositoryIdentityKey(repo)).not.toBe(
			repositoryIdentityKey({ ...repo, owner: "team", name: "sub/repo" }),
		);
	});
});
