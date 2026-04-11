import { describe, expect, test } from "bun:test";
import { normalizePullRequestQuery } from "./normalize-pull-request-query";

const repo = { owner: "superset-sh", name: "superset" };

describe("normalizePullRequestQuery", () => {
	// ── Empty / blank input ─────────────────────────────────────────
	describe("empty input", () => {
		test("empty string", () => {
			expect(normalizePullRequestQuery("", repo)).toEqual({
				query: "",
				repoMismatch: false,
				isDirectLookup: false,
			});
		});
	});

	// ── Plain text search ───────────────────────────────────────────
	describe("plain text search", () => {
		test("regular text query", () => {
			const result = normalizePullRequestQuery("fix login bug", repo);
			expect(result.query).toBe("fix login bug");
			expect(result.repoMismatch).toBe(false);
			expect(result.isDirectLookup).toBe(false);
		});

		test("text starting with a letter and containing numbers", () => {
			const result = normalizePullRequestQuery("v2 workspace", repo);
			expect(result.query).toBe("v2 workspace");
			expect(result.isDirectLookup).toBe(false);
		});

		test("text with special characters", () => {
			const result = normalizePullRequestQuery("feat: add auth", repo);
			expect(result.query).toBe("feat: add auth");
			expect(result.isDirectLookup).toBe(false);
		});
	});

	// ── Bare number ─────────────────────────────────────────────────
	describe("bare number (direct lookup)", () => {
		test("single digit", () => {
			const result = normalizePullRequestQuery("1", repo);
			expect(result.query).toBe("1");
			expect(result.isDirectLookup).toBe(true);
		});

		test("typical PR number", () => {
			const result = normalizePullRequestQuery("3130", repo);
			expect(result.query).toBe("3130");
			expect(result.isDirectLookup).toBe(true);
		});

		test("large PR number", () => {
			const result = normalizePullRequestQuery("99999", repo);
			expect(result.query).toBe("99999");
			expect(result.isDirectLookup).toBe(true);
		});
	});

	// ── # shorthand ─────────────────────────────────────────────────
	describe("#N shorthand (direct lookup)", () => {
		test("#123 strips the hash", () => {
			const result = normalizePullRequestQuery("#123", repo);
			expect(result.query).toBe("123");
			expect(result.isDirectLookup).toBe(true);
			expect(result.repoMismatch).toBe(false);
		});

		test("#1 single digit", () => {
			const result = normalizePullRequestQuery("#1", repo);
			expect(result.query).toBe("1");
			expect(result.isDirectLookup).toBe(true);
		});

		test("#3354 typical PR", () => {
			const result = normalizePullRequestQuery("#3354", repo);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("#abc is NOT shorthand — treated as plain text", () => {
			const result = normalizePullRequestQuery("#abc", repo);
			expect(result.query).toBe("#abc");
			expect(result.isDirectLookup).toBe(false);
		});

		test("#123abc is NOT shorthand — treated as plain text", () => {
			const result = normalizePullRequestQuery("#123abc", repo);
			expect(result.query).toBe("#123abc");
			expect(result.isDirectLookup).toBe(false);
		});
	});

	// ── GitHub PR URLs — same repo ──────────────────────────────────
	describe("GitHub PR URL (same repo)", () => {
		test("basic URL", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset/pull/3130",
				repo,
			);
			expect(result.query).toBe("3130");
			expect(result.isDirectLookup).toBe(true);
			expect(result.repoMismatch).toBe(false);
		});

		test("URL with /files tab", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset/pull/3354/files",
				repo,
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
			expect(result.repoMismatch).toBe(false);
		});

		test("URL with /changes tab", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset/pull/3354/changes",
				repo,
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("URL with /commits tab", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset/pull/3354/commits",
				repo,
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("URL with /checks tab", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset/pull/3354/checks",
				repo,
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("URL with trailing slash", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset/pull/3354/",
				repo,
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("URL with query params", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset/pull/3354?diff=unified",
				repo,
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("URL with query params and tab", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset/pull/3354/files?diff=split&w=1",
				repo,
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("URL with hash fragment", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset/pull/3354#discussion_r123",
				repo,
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("URL with hash fragment on files tab", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset/pull/3354/files#diff-abc123",
				repo,
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("URL with www prefix", () => {
			const result = normalizePullRequestQuery(
				"https://www.github.com/superset-sh/superset/pull/3354",
				repo,
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("http (not https)", () => {
			const result = normalizePullRequestQuery(
				"http://github.com/superset-sh/superset/pull/3354",
				repo,
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("case-insensitive owner/repo matching", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/Superset-SH/Superset/pull/100",
				repo,
			);
			expect(result.query).toBe("100");
			expect(result.isDirectLookup).toBe(true);
			expect(result.repoMismatch).toBe(false);
		});

		test("owner with dots and hyphens", () => {
			const dotRepo = { owner: "my.org-name", name: "my.repo-name" };
			const result = normalizePullRequestQuery(
				"https://github.com/my.org-name/my.repo-name/pull/42",
				dotRepo,
			);
			expect(result.query).toBe("42");
			expect(result.isDirectLookup).toBe(true);
			expect(result.repoMismatch).toBe(false);
		});
	});

	// ── GitHub PR URLs — cross-repo ─────────────────────────────────
	describe("GitHub PR URL (cross-repo mismatch)", () => {
		test("different owner", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/other-org/superset/pull/100",
				repo,
			);
			expect(result.query).toBe("");
			expect(result.repoMismatch).toBe(true);
			expect(result.isDirectLookup).toBe(false);
		});

		test("different repo name", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/other-repo/pull/100",
				repo,
			);
			expect(result.query).toBe("");
			expect(result.repoMismatch).toBe(true);
		});

		test("completely different owner and repo", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/facebook/react/pull/28000",
				repo,
			);
			expect(result.query).toBe("");
			expect(result.repoMismatch).toBe(true);
		});

		test("cross-repo with /files tab", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/other-org/other-repo/pull/50/files",
				repo,
			);
			expect(result.query).toBe("");
			expect(result.repoMismatch).toBe(true);
		});
	});

	// ── Non-matching URLs ───────────────────────────────────────────
	describe("non-PR URLs (treated as plain text)", () => {
		test("GitHub issue URL (not a PR)", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset/issues/100",
				repo,
			);
			expect(result.query).toBe(
				"https://github.com/superset-sh/superset/issues/100",
			);
			expect(result.isDirectLookup).toBe(false);
			expect(result.repoMismatch).toBe(false);
		});

		test("GitHub repo URL (no PR path)", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset",
				repo,
			);
			expect(result.query).toBe(
				"https://github.com/superset-sh/superset",
			);
			expect(result.isDirectLookup).toBe(false);
		});

		test("GitHub compare URL", () => {
			const result = normalizePullRequestQuery(
				"https://github.com/superset-sh/superset/compare/main...feature",
				repo,
			);
			expect(result.isDirectLookup).toBe(false);
			expect(result.repoMismatch).toBe(false);
		});

		test("non-GitHub URL", () => {
			const result = normalizePullRequestQuery(
				"https://gitlab.com/org/repo/merge_requests/123",
				repo,
			);
			expect(result.isDirectLookup).toBe(false);
			expect(result.repoMismatch).toBe(false);
		});

		test("SSH-style URL", () => {
			const result = normalizePullRequestQuery(
				"git@github.com:superset-sh/superset.git",
				repo,
			);
			expect(result.isDirectLookup).toBe(false);
		});

		test("GitHub Enterprise URL (not supported)", () => {
			const result = normalizePullRequestQuery(
				"https://github.mycompany.com/org/repo/pull/123",
				repo,
			);
			expect(result.isDirectLookup).toBe(false);
			expect(result.repoMismatch).toBe(false);
		});
	});
});
