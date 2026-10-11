import { describe, expect, test } from "bun:test";
import { promptBranchSlug } from "./prompt-branch-slug";

describe("promptBranchSlug", () => {
	test.each([
		["please fix the login redirect bug", "fix-login-redirect-bug"],
		["Résumé parser crashes", "resume-parser-crashes"],
		["refactor", "refactor"],
		["fix SUPER-2246 local workspaces", "fix-super-2246-local"],
		[
			"fix `parseConfig()` throwing on empty files",
			"fix-parseconfig-throwing-empty",
		],
		["🔥 fix the flaky terminal test 🙏", "fix-flaky-terminal-test"],
		[
			"Investigate why the host-service crashes on startup",
			"investigate-why-host-service",
		],
	])("names %j as %s", (prompt, slug) => {
		expect(promptBranchSlug(prompt)).toBe(slug);
	});

	test.each([
		[
			"fix https://github.com/superset-sh/superset/pull/8370 review comments",
			"fix-review-comments",
		],
		["check www.example.com/login redirect loop", "check-redirect-loop"],
		["the docs at docs.superset.sh are broken", "docs-broken"],
		["See [the spec](https://notion.so/abc123) and build it", "see-spec-build"],
		[
			"clone git@github.com:superset-sh/superset.git and run tests",
			"clone-run-tests",
		],
		["email jane.doe@acme.io about the invoice bug", "email-invoice-bug"],
		["@alice review the migration", "review-migration"],
		["fix crash in /Users/kietho/workplace/superset/src/main.ts", "fix-crash"],
		["update ~/.zshrc aliases", "update-aliases"],
		["rename README.md sections", "rename-sections"],
		["Can you look at #8123 and fix the flaky test?", "fix-flaky-test"],
		["revert commit 3fe2c3636e and fix tests", "revert-commit-fix-tests"],
		[
			"workspace 96c3bf73-82c6-49f7-8d50-61f8773c1e08 is stuck",
			"workspace-stuck",
		],
		[
			"use token ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8 to call the api",
			"use-token-call-api",
		],
		["set OPENAI_API_KEY=sk-proj-abc123def456ghi789 in env", "set-env"],
		["login with password hunter2 fails", "login-password-fails"],
		["ssh to 192.168.1.10 and restart nginx", "ssh-restart-nginx"],
		["1234567890 timestamps are wrong", "timestamps-wrong"],
		["fix this:\n```ts\nconst token = load(id)\n```", "fix"],
	])("keeps links, paths, ids and secrets out of %j", (prompt, slug) => {
		expect(promptBranchSlug(prompt)).toBe(slug);
	});

	test.each([
		"hi",
		"hey there",
		"hi! can you help me with something?",
		"https://example.com/a/b",
		"ログインのバグを直して",
		"  ",
	])("has nothing to name a folder by in %j", (prompt) => {
		expect(promptBranchSlug(prompt)).toBeNull();
	});
});
