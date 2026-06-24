import { describe, expect, it } from "bun:test";
import { parseGitRemote } from "./git-remote";

describe("parseGitRemote", () => {
	it("parses a GitHub HTTPS remote", () => {
		expect(parseGitRemote("https://github.com/acme/widget.git")).toEqual({
			provider: "github",
			host: "github.com",
			owner: "acme",
			name: "widget",
			url: "https://github.com/acme/widget",
		});
	});
	it("parses a GitHub SCP-style SSH remote", () => {
		expect(parseGitRemote("git@github.com:acme/widget.git")).toEqual({
			provider: "github",
			host: "github.com",
			owner: "acme",
			name: "widget",
			url: "https://github.com/acme/widget",
		});
	});
	it("parses a GitHub ssh:// remote without .git", () => {
		expect(parseGitRemote("ssh://git@github.com/acme/widget")).toEqual({
			provider: "github",
			host: "github.com",
			owner: "acme",
			name: "widget",
			url: "https://github.com/acme/widget",
		});
	});
	it("parses a gitlab.com HTTPS remote", () => {
		expect(parseGitRemote("https://gitlab.com/acme/widget.git")).toEqual({
			provider: "gitlab",
			host: "gitlab.com",
			owner: "acme",
			name: "widget",
			url: "https://gitlab.com/acme/widget",
		});
	});
	it("parses a gitlab.com nested-subgroup SSH remote (owner keeps the namespace path)", () => {
		expect(parseGitRemote("git@gitlab.com:acme/backend/widget.git")).toEqual({
			provider: "gitlab",
			host: "gitlab.com",
			owner: "acme/backend",
			name: "widget",
			url: "https://gitlab.com/acme/backend/widget",
		});
	});
	it("parses a self-managed host with a custom SSH port (provider unknown)", () => {
		expect(
			parseGitRemote("ssh://git@git.example.com:2222/team/repo.git"),
		).toEqual({
			provider: "unknown",
			host: "git.example.com",
			owner: "team",
			name: "repo",
			url: "https://git.example.com/team/repo",
		});
	});
	it("lowercases the host and strips a trailing slash", () => {
		expect(parseGitRemote("https://GitLab.com/Acme/Widget/")).toEqual({
			provider: "gitlab",
			host: "gitlab.com",
			owner: "Acme",
			name: "Widget",
			url: "https://gitlab.com/Acme/Widget",
		});
	});
	it("returns null for a non-remote string", () => {
		expect(parseGitRemote("not a url")).toBeNull();
	});
	it("returns null when there is no owner segment", () => {
		expect(parseGitRemote("https://github.com/widget.git")).toBeNull();
	});
	it("returns null for empty input", () => {
		expect(parseGitRemote("   ")).toBeNull();
	});

	it("returns null for a GitHub web URL with extra path segments", () => {
		expect(
			parseGitRemote("https://github.com/acme/widget/tree/main"),
		).toBeNull();
	});

	it("ignores a query string on a clone URL", () => {
		expect(
			parseGitRemote("https://github.com/acme/widget.git?foo=bar"),
		).toEqual({
			provider: "github",
			host: "github.com",
			owner: "acme",
			name: "widget",
			url: "https://github.com/acme/widget",
		});
	});

	it("ignores a URL fragment", () => {
		expect(parseGitRemote("https://github.com/acme/widget#readme")).toEqual({
			provider: "github",
			host: "github.com",
			owner: "acme",
			name: "widget",
			url: "https://github.com/acme/widget",
		});
	});

	it("strips an uppercase .GIT suffix", () => {
		expect(parseGitRemote("https://github.com/acme/widget.GIT")).toEqual({
			provider: "github",
			host: "github.com",
			owner: "acme",
			name: "widget",
			url: "https://github.com/acme/widget",
		});
	});

	it("parses a deep GitLab subgroup path", () => {
		expect(
			parseGitRemote("git@gitlab.com:acme/team/backend/widget.git"),
		).toEqual({
			provider: "gitlab",
			host: "gitlab.com",
			owner: "acme/team/backend",
			name: "widget",
			url: "https://gitlab.com/acme/team/backend/widget",
		});
	});

	it("trims a GitLab web URL at the /-/ sub-resource separator", () => {
		expect(
			parseGitRemote("https://gitlab.com/acme/widget/-/merge_requests/1"),
		).toEqual({
			provider: "gitlab",
			host: "gitlab.com",
			owner: "acme",
			name: "widget",
			url: "https://gitlab.com/acme/widget",
		});
	});

	it("strips .git even when a /-/ sub-resource path follows it", () => {
		expect(
			parseGitRemote("https://gitlab.com/acme/widget.git/-/issues/3"),
		).toEqual({
			provider: "gitlab",
			host: "gitlab.com",
			owner: "acme",
			name: "widget",
			url: "https://gitlab.com/acme/widget",
		});
	});

	it("parses a self-managed HTTPS remote with a port", () => {
		expect(
			parseGitRemote("https://git.example.com:8080/owner/repo.git"),
		).toEqual({
			provider: "unknown",
			host: "git.example.com",
			owner: "owner",
			name: "repo",
			url: "https://git.example.com/owner/repo",
		});
	});
});
