import { describe, expect, test } from "bun:test";
import { parseGitHubRemote } from "./parse-github-remote";

describe("parseGitHubRemote", () => {
	test("parses SSH remote (git@)", () => {
		const result = parseGitHubRemote("git@github.com:owner/repo.git");
		expect(result).toEqual({
			provider: "github",
			owner: "owner",
			name: "repo",
			url: "https://github.com/owner/repo",
		});
	});

	test("parses SSH remote without .git suffix", () => {
		const result = parseGitHubRemote("git@github.com:owner/repo");
		expect(result).toEqual({
			provider: "github",
			owner: "owner",
			name: "repo",
			url: "https://github.com/owner/repo",
		});
	});

	test("parses SSH protocol remote", () => {
		const result = parseGitHubRemote("ssh://git@github.com/owner/repo.git");
		expect(result).toEqual({
			provider: "github",
			owner: "owner",
			name: "repo",
			url: "https://github.com/owner/repo",
		});
	});

	test("parses HTTPS remote", () => {
		const result = parseGitHubRemote("https://github.com/owner/repo.git");
		expect(result).toEqual({
			provider: "github",
			owner: "owner",
			name: "repo",
			url: "https://github.com/owner/repo",
		});
	});

	test("parses HTTPS remote without .git suffix", () => {
		const result = parseGitHubRemote("https://github.com/owner/repo");
		expect(result).toEqual({
			provider: "github",
			owner: "owner",
			name: "repo",
			url: "https://github.com/owner/repo",
		});
	});

	test("parses HTTPS remote with trailing slash", () => {
		const result = parseGitHubRemote("https://github.com/owner/repo/");
		expect(result).toEqual({
			provider: "github",
			owner: "owner",
			name: "repo",
			url: "https://github.com/owner/repo",
		});
	});

	test("trims whitespace and newlines", () => {
		const result = parseGitHubRemote("  git@github.com:owner/repo.git\n");
		expect(result).toEqual({
			provider: "github",
			owner: "owner",
			name: "repo",
			url: "https://github.com/owner/repo",
		});
	});

	test("returns null for non-GitHub remotes", () => {
		expect(parseGitHubRemote("git@gitlab.com:owner/repo.git")).toBeNull();
		expect(
			parseGitHubRemote("https://bitbucket.org/owner/repo.git"),
		).toBeNull();
	});

	test("returns null for empty or invalid input", () => {
		expect(parseGitHubRemote("")).toBeNull();
		expect(parseGitHubRemote("not-a-url")).toBeNull();
	});
});
