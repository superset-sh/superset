import { describe, expect, test } from "bun:test";
import { promptBranchSlug } from "./prompt-branch-slug";

const named: Array<[string, string]> = [
	["please fix the login redirect bug", "fix-login-redirect-bug"],
	["'Fix the auth bug'", "fix-auth-bug"],
	["FIX LOGIN NOW!!!", "fix-login-now"],
	["refactor", "refactor"],
	["fix token refresh", "fix-token-refresh"],
	["password reset email broken", "password-reset-email-broken"],
	["secret rotation job fails", "secret-rotation-job-fails"],
	["login with password Summer2024 fails", "login-password-fails"],
	["x", "x"],
	["v2 api migration", "v2-api-migration"],
	["fix SUPER-2246 local workspaces", "fix-super-2246-local"],
	["PROJ-7 Fix flaky import", "proj-7-fix-flaky"],
	[
		"Investigate why the host-service crashes on startup",
		"investigate-why-host-service",
	],
	["Can't enable browser notifications", "cant-enable-browser"],
	["Can’t enable browser notifications", "cant-enable-browser"],
	["fix login/logout flow", "fix-login-logout-flow"],
	["feature/add issue drawer", "feature-add-issue-drawer"],
	["issue/137 Worktree Spaces", "issue-137-worktree-spaces"],
	['"feat/login_flow!!"', "feat-login-flow"],
	["fix_login_redirect_bug", "fix-login-redirect-bug"],
	[
		"fix `parseConfig()` throwing on empty files",
		"fix-parseconfig-throwing-empty",
	],
	["new - branch", "new-branch"],
	["foo--bar", "foo-bar"],
	["1. fix login 2. fix logout", "fix-login-fix-logout"],
	["Fix\u00a0Pasted\tWorkspace", "fix-pasted-workspace"],
	["  \n\n   fix login after blank lines", "fix-login-after-blank"],
	["🔥 fix the flaky terminal test 🙏", "fix-flaky-terminal-test"],
	["Résumé parser crashes", "resume-parser-crashes"],
	["naïve café crème brûlée", "naive-cafe-creme-brulee"],
	["ÄÖÜ äöü ß straße fix", "aou-aou-ss-strasse"],
	["Привет fix login", "fix-login"],
	["feat: 中文 (v2)", "feat-v2"],
];

const leaks: Array<[string, string]> = [
	[
		"fix https://github.com/superset-sh/superset/pull/8370 review comments",
		"fix-review-comments",
	],
	["HTTP://EXAMPLE.COM is down", "down"],
	["check www.example.com/login redirect loop", "check-redirect-loop"],
	["the docs at docs.superset.sh are broken", "docs-broken"],
	["go to (https://example.com) and check", "go-check"],
	["<https://example.com> returns 500", "returns-500"],
	["See [the spec](https://notion.so/abc123) and build it", "see-spec-build"],
	["open localhost:3000/settings and fix layout", "open-fix-layout"],
	["connect to postgres://admin:s3cret@db.internal:5432/app", "connect"],
	[
		"clone git@github.com:superset-sh/superset.git and run tests",
		"clone-run-tests",
	],
	["email jane.doe@acme.io about the invoice bug", "email-invoice-bug"],
	["mailto:support@superset.sh template", "template"],
	["@alice review the migration", "review-migration"],
	[
		"@src/components/Button.tsx make the hover state darker",
		"hover-state-darker",
	],
	["fix crash in /Users/kietho/workplace/superset/src/main.ts", "fix-crash"],
	["C:\\Users\\kiet\\project\\main.ts crashes on windows", "crashes-windows"],
	["update ~/.zshrc aliases", "update-aliases"],
	["fix ./scripts/release.sh", "fix"],
	[
		"refactor src/lib/auth-client.ts to use bearer tokens",
		"refactor-use-bearer-tokens",
	],
	["node_modules/.bin/tsc not found", "not-found"],
	["../../Fix mobile Tasks 🚀", "mobile-tasks"],
	["refs/heads/main is protected", "protected"],
	["rename README.md sections", "rename-sections"],
	["edit package.json scripts", "edit-scripts"],
	["Issue #123: Fix mobile Tasks", "fix-mobile-tasks"],
	["Add mobile drawer (#812)", "add-mobile-drawer"],
	["fix MR !77 conflicts", "fix-conflicts"],
	["Can you look at #8123 and fix the flaky test?", "fix-flaky-test"],
	["revert commit 3fe2c3636e and fix tests", "revert-commit-fix-tests"],
	[
		"workspace 96c3bf73-82c6-49f7-8d50-61f8773c1e08 is stuck",
		"workspace-stuck",
	],
	["1234567890 timestamps are wrong", "timestamps-wrong"],
	["ssh to 192.168.1.10 and restart nginx", "ssh-restart-nginx"],
	["bump react to 19.1.0", "bump-react"],
	[
		"use token ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8 to call the api",
		"use-token-call-api",
	],
	["use AKIAIOSFODNN7EXAMPLE to read the bucket", "use-read-bucket"],
	[
		"jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc fails to verify",
		"jwt-fails-verify",
	],
	["slack xoxb-1234-5678-abcdEFGHijkl broke", "slack-broke"],
	["set OPENAI_API_KEY=sk-proj-abc123def456ghi789 in env", "set-env"],
	["login with password hunter2 fails", "login-password-fails"],
	["my token: abc123 expired", "token-expired"],
	["secret is hunter2", "secret"],
	["pass: correcthorse", "pass"],
	["the api_key Xk29fa is wrong", "api-key-wrong"],
	["Bearer abc.def.ghi rejected by api", "bearer-rejected-by-api"],
	["fix this:\n```ts\nconst token = load(id)\n```", "fix"],
	[
		"TypeError: Cannot read properties of undefined\n    at render (App.tsx:12:5)",
		"typeerror-cannot-read",
	],
];

const nothingToName = [
	"hi",
	"hey there",
	"hi! can you help me with something?",
	"https://example.com/a/b",
	"#123",
	"@claude",
	"/compact",
	"?",
	"-",
	"   !!! ___ ",
	"🙂🙂🙂",
	"ログインのバグを直して",
	"a".repeat(80),
	"",
	"  ",
];

const refTraps = [
	".this..is\\not fine:yo?|is-it",
	"foo.lock.lock",
	"branch.lock stuck",
	"HEAD@{1} recovery",
	"fix the @{u} upstream bug",
	"--force flag parsing",
	"...and also fix login",
	"hello/",
	"++keep-the-rest",
	"  Fix: login / callback\n\tregression\u0000  ",
	"Review \u202eexe.txt",
	"tab\tnewline\ncarriage\rnull\u0000",
];

describe("promptBranchSlug", () => {
	test.each(named)("names %j as %s", (prompt, slug) => {
		expect(promptBranchSlug(prompt)).toBe(slug);
	});

	test.each(
		leaks,
	)("keeps links, paths, ids and secrets out of %j", (prompt, slug) => {
		expect(promptBranchSlug(prompt)).toBe(slug);
	});

	test.each(
		nothingToName,
	)("has nothing to name a folder by in %j", (prompt) => {
		expect(promptBranchSlug(prompt)).toBeNull();
	});

	test("only ever returns a short, valid git ref segment", () => {
		const inputs = [
			...named.map(([prompt]) => prompt),
			...leaks.map(([prompt]) => prompt),
			...refTraps,
		];
		for (const prompt of inputs) {
			const slug = promptBranchSlug(prompt);
			if (slug === null) continue;
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(slug.length).toBeLessThanOrEqual(30);
		}
	});
});
