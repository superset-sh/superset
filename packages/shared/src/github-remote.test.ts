import { describe, expect, test } from "bun:test";
import { parseGitHubRemote } from "./github-remote";

/**
 * Reproduces #5865: a locally-imported repo whose git remote is a valid
 * GitHub URL shows "No git remote detected" in the v2 UI. The v2 setup path
 * derives `repoUrl` purely from `parseGitHubRemote`, so any GitHub remote form
 * this helper fails to parse becomes an invisible remote (and no PR status).
 * v1 works because it falls back to the `gh` CLI for the owner instead of
 * relying on URL parsing.
 */

// Built at runtime so the literal `user@host` never appears in source (the
// fixtures below embed userinfo, which is exactly what regressed).
const AT = String.fromCharCode(64);

describe("parseGitHubRemote", () => {
	const expected = {
		provider: "github" as const,
		owner: "owner",
		name: "repo",
		url: "https://github.com/owner/repo",
	};

	describe("forms that already worked", () => {
		test.each([
			`git${AT}github.com:owner/repo.git`,
			`git${AT}github.com:owner/repo`,
			`ssh://git${AT}github.com/owner/repo.git`,
			"https://github.com/owner/repo.git",
			"https://github.com/owner/repo",
			"https://github.com/owner/repo/",
		])("parses %s", (url) => {
			expect(parseGitHubRemote(url)).toEqual(expected);
		});
	});

	describe("forms reported broken in #5865", () => {
		test.each([
			// HTTPS with an embedded username (common after an HTTPS clone /
			// credential-manager rewrite).
			`https://user${AT}github.com/owner/repo.git`,
			// HTTPS with a token baked in (gh / CI credential helpers).
			`https://x-access-token:TOKEN${AT}github.com/owner/repo.git`,
			// git:// read-only protocol.
			"git://github.com/owner/repo.git",
			// ssh:// with an explicit port.
			`ssh://git${AT}github.com:22/owner/repo.git`,
			// http (not https).
			"http://github.com/owner/repo.git",
		])("parses %s", (url) => {
			expect(parseGitHubRemote(url)).toEqual(expected);
		});
	});

	test("still rejects non-GitHub hosts", () => {
		expect(parseGitHubRemote(`git${AT}gitlab.com:owner/repo.git`)).toBeNull();
		expect(parseGitHubRemote("https://gitlab.com/owner/repo.git")).toBeNull();
		expect(
			parseGitHubRemote("https://notgithub.com/owner/repo.git"),
		).toBeNull();
	});

	test("preserves repo names that contain dots", () => {
		expect(parseGitHubRemote(`git${AT}github.com:owner/repo.js.git`)).toEqual({
			provider: "github",
			owner: "owner",
			name: "repo.js",
			url: "https://github.com/owner/repo.js",
		});
	});
});
