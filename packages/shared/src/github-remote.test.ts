import { describe, expect, test } from "bun:test";
import {
	parseGitHubRemote,
	parseGitLabRemote,
	parseRepositoryRemote,
} from "./github-remote";

describe("repository remote parsing", () => {
	test("keeps GitHub parsing unchanged", () => {
		expect(parseGitHubRemote("git@github.com:acme/example.git")).toEqual({
			provider: "github",
			owner: "acme",
			name: "example",
			url: "https://github.com/acme/example",
		});
	});

	test.each([
		"git@gitlab.com:acme/platform/example.git",
		"ssh://git@gitlab.com/acme/platform/example.git",
		"https://gitlab.com/acme/platform/example.git",
	])("parses GitLab subgroup remotes: %s", (remoteUrl) => {
		expect(parseGitLabRemote(remoteUrl)).toEqual({
			provider: "gitlab",
			owner: "acme/platform",
			name: "example",
			url: "https://gitlab.com/acme/platform/example",
		});
	});

	test.each([
		"git@gitlab.example.com:acme/platform/example.git",
		"ssh://git@gitlab.example.com/acme/platform/example.git",
		"https://gitlab.example.com/acme/platform/example.git",
	])("parses self-hosted GitLab subgroup remotes: %s", (remoteUrl) => {
		expect(parseGitLabRemote(remoteUrl)).toEqual({
			provider: "gitlab",
			owner: "acme/platform",
			name: "example",
			url: "https://gitlab.example.com/acme/platform/example",
		});
	});

	test("detects either supported provider", () => {
		expect(
			parseRepositoryRemote("https://gitlab.com/acme/example.git")?.provider,
		).toBe("gitlab");
		expect(
			parseRepositoryRemote("https://github.com/acme/example.git")?.provider,
		).toBe("github");
	});
});
