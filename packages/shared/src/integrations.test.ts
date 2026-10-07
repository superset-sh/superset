import { expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_INTEGRATION_FIXTURE !== "roster") {
	test("integration roster has isolated localization", () => {
		const cwd = mkdtempSync("/tmp/superset-integration-roster-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						SUPERSET_INTEGRATION_FIXTURE: "roster",
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
	mock.module("@lingui/core/macro", () => ({ msg: (value: unknown) => value }));
	mock.module("./i18n", () => ({
		i18n: { _: (value: { message: string }) => value.message },
	}));
	const { INTEGRATIONS, offeredIntegrations, isIntegrationOffered } =
		await import("./integrations");
	test("one standalone GitLab connection is offered without automation flags", () => {
		const rows = offeredIntegrations(undefined).filter(
			(row) => String(row.provider) === "gitlab",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.webPath).toBe("/integrations/gitlab");
		expect(rows[0]?.triggerKinds).toEqual(["gitlab"]);
		expect(rows[0]?.label).toBe("GitLab");
	});
	test("enabling GitLab triggers never creates a second card", () => {
		expect(
			offeredIntegrations(["gitlab"]).filter(
				(row) => String(row.provider) === "gitlab",
			),
		).toHaveLength(1);
	});
	test("all upstream provider defaults remain intact", () => {
		expect(
			INTEGRATIONS.filter((row) => String(row.provider) !== "gitlab").map(
				(row) => [
					row.provider,
					row.webPath,
					row.triggerKinds,
					"standalone" in row && row.standalone,
				],
			),
		).toEqual([
			["linear", "/integrations/linear", ["linear"], true],
			["github", "/integrations/github", ["github"], true],
			["slack", "/integrations/slack", ["slack"], true],
			["notion", "/integrations/notion", ["notion"], false],
			[
				"microsoft_teams",
				"/integrations/microsoft-teams",
				["microsoft_teams"],
				false,
			],
			["sentry", "/integrations/sentry", ["sentry"], false],
			["google", "/integrations/google", ["gmail"], false],
		]);
		expect(
			offeredIntegrations(undefined)
				.filter((row) => String(row.provider) !== "gitlab")
				.map((row) => row.provider),
		).toEqual(["linear", "github", "slack"]);
		expect(isIntegrationOffered("github", undefined)).toBe(true);
	});
}
