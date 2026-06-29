import { describe, expect, it } from "bun:test";
import { parseGitHubRemote } from "./github-remote";

describe("parseGitHubRemote (back-compat wrapper)", () => {
	it("parses a GitHub HTTPS clone URL to the legacy shape", () => {
		const expected = {
			provider: "github" as const,
			owner: "acme",
			name: "widget",
			url: "https://github.com/acme/widget",
		};
		expect(parseGitHubRemote("https://github.com/acme/widget.git")).toEqual(
			expected,
		);
	});

	it("parses a GitHub SCP-style SSH remote to the legacy shape", () => {
		const expected = {
			provider: "github" as const,
			owner: "acme",
			name: "widget",
			url: "https://github.com/acme/widget",
		};
		expect(parseGitHubRemote("git@github.com:acme/widget.git")).toEqual(
			expected,
		);
	});

	it("parses a GitHub ssh:// remote to the legacy shape", () => {
		const expected = {
			provider: "github" as const,
			owner: "acme",
			name: "widget",
			url: "https://github.com/acme/widget",
		};
		expect(parseGitHubRemote("ssh://git@github.com/acme/widget")).toEqual(
			expected,
		);
	});
	it("returns null for non-GitHub hosts (gitlab stays local-only)", () => {
		expect(parseGitHubRemote("git@gitlab.com:acme/widget.git")).toBeNull();
		expect(
			parseGitHubRemote("https://git.example.com/team/repo.git"),
		).toBeNull();
	});
	it("returns null for invalid input", () => {
		expect(parseGitHubRemote("not a url")).toBeNull();
	});
});
