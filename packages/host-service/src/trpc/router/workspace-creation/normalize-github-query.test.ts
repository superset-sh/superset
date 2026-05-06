import { describe, expect, test } from "bun:test";
import { normalizeGitHubQuery } from "./normalize-github-query";

const repo = { owner: "superset-sh", name: "superset" };

// ─────────────────────────────────────────────────────────────────────────────
// Shared behaviors (same for both kinds)
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeGitHubQuery — shared behaviors", () => {
	describe("empty input", () => {
		test("empty string (pull)", () => {
			expect(normalizeGitHubQuery("", repo, "pull")).toEqual({
				query: "",
				repoMismatch: false,
				isDirectLookup: false,
			});
		});

		test("empty string (issue)", () => {
			expect(normalizeGitHubQuery("", repo, "issue")).toEqual({
				query: "",
				repoMismatch: false,
				isDirectLookup: false,
			});
		});
	});

	describe("plain text search", () => {
		test("regular text", () => {
			const result = normalizeGitHubQuery("fix login bug", repo, "pull");
			expect(result.query).toBe("fix login bug");
			expect(result.isDirectLookup).toBe(false);
			expect(result.repoMismatch).toBe(false);
		});

		test("text with numbers", () => {
			const result = normalizeGitHubQuery("v2 workspace", repo, "issue");
			expect(result.query).toBe("v2 workspace");
			expect(result.isDirectLookup).toBe(false);
		});

		test("text with special characters", () => {
			const result = normalizeGitHubQuery("feat: add auth", repo, "pull");
			expect(result.query).toBe("feat: add auth");
			expect(result.isDirectLookup).toBe(false);
		});
	});

	describe("bare number (direct lookup)", () => {
		test("single digit", () => {
			const result = normalizeGitHubQuery("1", repo, "pull");
			expect(result.query).toBe("1");
			expect(result.isDirectLookup).toBe(true);
		});

		test("typical number", () => {
			const result = normalizeGitHubQuery("3130", repo, "issue");
			expect(result.query).toBe("3130");
			expect(result.isDirectLookup).toBe(true);
		});

		test("large number", () => {
			const result = normalizeGitHubQuery("99999", repo, "pull");
			expect(result.query).toBe("99999");
			expect(result.isDirectLookup).toBe(true);
		});
	});

	describe("#N shorthand (direct lookup)", () => {
		test("#123 strips the hash", () => {
			const result = normalizeGitHubQuery("#123", repo, "pull");
			expect(result.query).toBe("123");
			expect(result.isDirectLookup).toBe(true);
			expect(result.repoMismatch).toBe(false);
		});

		test("#1 single digit", () => {
			const result = normalizeGitHubQuery("#1", repo, "issue");
			expect(result.query).toBe("1");
			expect(result.isDirectLookup).toBe(true);
		});

		test("#3354 typical", () => {
			const result = normalizeGitHubQuery("#3354", repo, "pull");
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("#abc is NOT shorthand", () => {
			const result = normalizeGitHubQuery("#abc", repo, "pull");
			expect(result.query).toBe("#abc");
			expect(result.isDirectLookup).toBe(false);
		});

		test("#123abc is NOT shorthand", () => {
			const result = normalizeGitHubQuery("#123abc", repo, "issue");
			expect(result.query).toBe("#123abc");
			expect(result.isDirectLookup).toBe(false);
		});
	});

	describe("non-GitHub URLs (plain text fallback)", () => {
		test("GitHub repo URL (no entity path)", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset",
				repo,
				"pull",
			);
			expect(result.isDirectLookup).toBe(false);
			expect(result.repoMismatch).toBe(false);
		});

		test("GitHub compare URL", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/compare/main...feature",
				repo,
				"pull",
			);
			expect(result.isDirectLookup).toBe(false);
		});

		test("non-GitHub URL", () => {
			const result = normalizeGitHubQuery(
				"https://gitlab.com/org/repo/merge_requests/123",
				repo,
				"pull",
			);
			expect(result.isDirectLookup).toBe(false);
			expect(result.repoMismatch).toBe(false);
		});

		test("SSH-style URL", () => {
			const result = normalizeGitHubQuery(
				"git@github.com:superset-sh/superset.git",
				repo,
				"pull",
			);
			expect(result.isDirectLookup).toBe(false);
		});

		test("GitHub Enterprise URL (not supported)", () => {
			const result = normalizeGitHubQuery(
				"https://github.mycompany.com/org/repo/pull/123",
				repo,
				"pull",
			);
			expect(result.isDirectLookup).toBe(false);
			expect(result.repoMismatch).toBe(false);
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// PR URL tests (kind = "pull")
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeGitHubQuery — PR URLs", () => {
	describe("same repo", () => {
		test("basic URL", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/pull/3130",
				repo,
				"pull",
			);
			expect(result.query).toBe("3130");
			expect(result.isDirectLookup).toBe(true);
			expect(result.repoMismatch).toBe(false);
		});

		test("/files tab", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/pull/3354/files",
				repo,
				"pull",
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("/changes tab", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/pull/3354/changes",
				repo,
				"pull",
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("/commits tab", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/pull/3354/commits",
				repo,
				"pull",
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("/checks tab", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/pull/3354/checks",
				repo,
				"pull",
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("trailing slash", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/pull/3354/",
				repo,
				"pull",
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("query params", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/pull/3354?diff=unified",
				repo,
				"pull",
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("query params on tab", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/pull/3354/files?diff=split&w=1",
				repo,
				"pull",
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("hash fragment", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/pull/3354#discussion_r123",
				repo,
				"pull",
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("hash fragment on files tab", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/pull/3354/files#diff-abc123",
				repo,
				"pull",
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("www prefix", () => {
			const result = normalizeGitHubQuery(
				"https://www.github.com/superset-sh/superset/pull/3354",
				repo,
				"pull",
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("http (not https)", () => {
			const result = normalizeGitHubQuery(
				"http://github.com/superset-sh/superset/pull/3354",
				repo,
				"pull",
			);
			expect(result.query).toBe("3354");
			expect(result.isDirectLookup).toBe(true);
		});

		test("case-insensitive owner/repo", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/Superset-SH/Superset/pull/100",
				repo,
				"pull",
			);
			expect(result.query).toBe("100");
			expect(result.isDirectLookup).toBe(true);
			expect(result.repoMismatch).toBe(false);
		});

		test("owner with dots and hyphens", () => {
			const dotRepo = { owner: "my.org-name", name: "my.repo-name" };
			const result = normalizeGitHubQuery(
				"https://github.com/my.org-name/my.repo-name/pull/42",
				dotRepo,
				"pull",
			);
			expect(result.query).toBe("42");
			expect(result.isDirectLookup).toBe(true);
			expect(result.repoMismatch).toBe(false);
		});
	});

	describe("cross-repo mismatch", () => {
		test("different owner", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/other-org/superset/pull/100",
				repo,
				"pull",
			);
			expect(result.query).toBe("");
			expect(result.repoMismatch).toBe(true);
			expect(result.isDirectLookup).toBe(false);
		});

		test("different repo name", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/other-repo/pull/100",
				repo,
				"pull",
			);
			expect(result.query).toBe("");
			expect(result.repoMismatch).toBe(true);
		});

		test("completely different", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/facebook/react/pull/28000",
				repo,
				"pull",
			);
			expect(result.query).toBe("");
			expect(result.repoMismatch).toBe(true);
		});

		test("cross-repo with /files tab", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/other-org/other-repo/pull/50/files",
				repo,
				"pull",
			);
			expect(result.query).toBe("");
			expect(result.repoMismatch).toBe(true);
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Issue URL tests (kind = "issue")
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeGitHubQuery — issue URLs", () => {
	describe("same repo", () => {
		test("basic URL", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/issues/100",
				repo,
				"issue",
			);
			expect(result.query).toBe("100");
			expect(result.isDirectLookup).toBe(true);
			expect(result.repoMismatch).toBe(false);
		});

		test("trailing slash", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/issues/100/",
				repo,
				"issue",
			);
			expect(result.query).toBe("100");
			expect(result.isDirectLookup).toBe(true);
		});

		test("query params", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/issues/100?q=1",
				repo,
				"issue",
			);
			expect(result.query).toBe("100");
			expect(result.isDirectLookup).toBe(true);
		});

		test("hash fragment (comment anchor)", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/superset/issues/100#issuecomment-12345",
				repo,
				"issue",
			);
			expect(result.query).toBe("100");
			expect(result.isDirectLookup).toBe(true);
		});

		test("www prefix", () => {
			const result = normalizeGitHubQuery(
				"https://www.github.com/superset-sh/superset/issues/200",
				repo,
				"issue",
			);
			expect(result.query).toBe("200");
			expect(result.isDirectLookup).toBe(true);
		});

		test("http (not https)", () => {
			const result = normalizeGitHubQuery(
				"http://github.com/superset-sh/superset/issues/200",
				repo,
				"issue",
			);
			expect(result.query).toBe("200");
			expect(result.isDirectLookup).toBe(true);
		});

		test("case-insensitive owner/repo", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/Superset-SH/SUPERSET/issues/55",
				repo,
				"issue",
			);
			expect(result.query).toBe("55");
			expect(result.repoMismatch).toBe(false);
			expect(result.isDirectLookup).toBe(true);
		});
	});

	describe("cross-repo mismatch", () => {
		test("different owner", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/other-org/superset/issues/100",
				repo,
				"issue",
			);
			expect(result.query).toBe("");
			expect(result.repoMismatch).toBe(true);
		});

		test("different repo", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/superset-sh/other-repo/issues/100",
				repo,
				"issue",
			);
			expect(result.query).toBe("");
			expect(result.repoMismatch).toBe(true);
		});

		test("completely different with fragment", () => {
			const result = normalizeGitHubQuery(
				"https://github.com/facebook/react/issues/9999#issuecomment-1",
				repo,
				"issue",
			);
			expect(result.query).toBe("");
			expect(result.repoMismatch).toBe(true);
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-entity tests (wrong URL kind pasted)
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeGitHubQuery — cross-entity fallback", () => {
	test("issue URL pasted into PR search → plain text", () => {
		const result = normalizeGitHubQuery(
			"https://github.com/superset-sh/superset/issues/100",
			repo,
			"pull",
		);
		expect(result.query).toBe(
			"https://github.com/superset-sh/superset/issues/100",
		);
		expect(result.isDirectLookup).toBe(false);
		expect(result.repoMismatch).toBe(false);
	});

	test("PR URL pasted into issue search → plain text", () => {
		const result = normalizeGitHubQuery(
			"https://github.com/superset-sh/superset/pull/3354",
			repo,
			"issue",
		);
		expect(result.query).toBe(
			"https://github.com/superset-sh/superset/pull/3354",
		);
		expect(result.isDirectLookup).toBe(false);
		expect(result.repoMismatch).toBe(false);
	});

	test("cross-repo issue URL pasted into PR search → plain text (no mismatch)", () => {
		const result = normalizeGitHubQuery(
			"https://github.com/facebook/react/issues/100",
			repo,
			"pull",
		);
		expect(result.isDirectLookup).toBe(false);
		expect(result.repoMismatch).toBe(false);
	});

	test("cross-repo PR URL pasted into issue search → plain text (no mismatch)", () => {
		const result = normalizeGitHubQuery(
			"https://github.com/facebook/react/pull/28000",
			repo,
			"issue",
		);
		expect(result.isDirectLookup).toBe(false);
		expect(result.repoMismatch).toBe(false);
	});
});
