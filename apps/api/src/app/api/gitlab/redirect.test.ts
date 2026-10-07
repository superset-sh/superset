import { expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_GITLAB_REDIRECT_FIXTURE !== "1") {
	test("GitLab return URLs run with fixture-only configuration", () => {
		const cwd = mkdtempSync("/tmp/superset-gitlab-return-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						SUPERSET_GITLAB_REDIRECT_FIXTURE: "1",
					},
					stdout: "pipe",
					stderr: "pipe",
					timeout: 30000,
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.exitCode).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
} else {
	mock.module("@/env", () => ({
		env: { NEXT_PUBLIC_WEB_URL: "https://web.example:8443" },
	}));
	const { gitlabReturnUrl, redirectGitLab } = await import("./redirect");
	test("verified member identity replaces forged organization parameters with URL-safe encoding", () => {
		const target = new URL(
			gitlabReturnUrl(
				{ connected: "1", organizationId: "forged" },
				{ organizationId: "org &/ nested" },
			),
		);
		expect(target.origin).toBe("https://web.example:8443");
		expect(target.pathname).toBe("/integrations/gitlab");
		expect(target.searchParams.get("organizationId")).toBe("org &/ nested");
		expect(target.searchParams.get("connected")).toBe("1");
	});
	test("unauthenticated errors do not reflect an organization target", () => {
		const target = new URL(
			gitlabReturnUrl({ error: "sign_in", organizationId: "forged" }),
		);
		expect(target.searchParams.has("organizationId")).toBe(false);
		expect(target.searchParams.get("error")).toBe("sign_in");
	});
	test("redirect retains released status and trusted web origin", () => {
		const response = redirectGitLab(
			{ disconnected: "1" },
			{ organizationId: "org-a" },
		);
		expect(response.status).toBe(303);
		expect(
			new URL(response.headers.get("location") ?? "").searchParams.get(
				"organizationId",
			),
		).toBe("org-a");
	});
}
