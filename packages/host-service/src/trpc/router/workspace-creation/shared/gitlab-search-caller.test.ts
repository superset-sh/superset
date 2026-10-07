import { expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import type { HostServiceContext } from "../../../../types";
import type { SearchTarget } from "./gitlab-search-caller";

if (process.env.SUPERSET_SEARCH_CALLER_FIXTURE !== "shared") {
	test("search helpers run with isolated module boundaries", () => {
		const cwd = mkdtempSync("/tmp/superset-search-helper-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_SEARCH_CALLER_FIXTURE: "shared",
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
	}, 35000);
} else {
	mock.module("dotenv", () => ({ config: () => ({ parsed: {} }) }));
	const { selectSearchTargetsForQuery, createGitLabSearchClient } =
		await import("./gitlab-search-caller");
	const targets: [SearchTarget, SearchTarget] = [
		{
			projectId: "gh",
			repo: {
				provider: "github" as const,
				host: "github.com",
				owner: "Team",
				name: "Widget",
				url: "https://github.com/Team/Widget",
				remoteName: "origin",
				repoPath: "/fixture/gh",
			},
		},
		{
			projectId: "gl",
			repo: {
				provider: "gitlab" as const,
				host: "git.example.invalid:8443",
				owner: "Group/Sub",
				name: "Widget",
				url: "https://git.example.invalid:8443/Group/Sub/Widget",
				remoteName: "native",
				repoPath: "/fixture/gl",
			},
		},
	];
	test("direct native diff links retain the selected project identity", () => {
		const selection = selectSearchTargetsForQuery(
			"https://git.example.invalid:8443/Group/Sub/Widget/-/merge_requests/7/diffs",
			targets,
			"pull",
		);
		expect(selection.targets.map((target) => target.projectId)).toEqual(["gl"]);
		expect(selection.query).toBe("7");
	});
	test.each([
		"https://git.example.invalid:65536/Group/Sub/Widget/-/merge_requests/7",
		"https://@git.example.invalid:8443/Group/Sub/Widget/-/merge_requests/7",
		"https://git.example.invalid:8443/Group%2fSub/Widget/-/merge_requests/7",
		"https://git.example.invalid:8443/Group/Sub/Widget/-/merge_requests/9007199254740993",
	])("rejects unsafe native lookup instead of searching the raw URL %s", (query) => {
		expect(() => selectSearchTargetsForQuery(query, targets, "pull")).toThrow();
	});
	test("an opposite-kind URL remains free text", () => {
		const query =
			"https://git.example.invalid:8443/Group/Sub/Widget/-/issues/7";
		const selection = selectSearchTargetsForQuery(query, targets, "pull");
		expect(selection.targets).toHaveLength(2);
		expect(selection.query).toBe(query);
	});
	test("GitHub URLs retain case-insensitive matching and exclude native targets", () => {
		const query = "https://github.com/team/widget/pull/7#discussion";
		const selection = selectSearchTargetsForQuery(query, targets, "pull");
		expect(selection.targets.map((target) => target.projectId)).toEqual(["gh"]);
		expect(selection.query).toBe(query);
	});
	test("does not change upstream normalization for a GitHub-only request", () => {
		const query = "https://github.com/team/widget/issues/7";
		expect(selectSearchTargetsForQuery(query, [targets[0]], "pull")).toEqual({
			targets: [targets[0]],
			query,
		});
	});
	test("credentials are requested only for the selected exact authority", async () => {
		const hosts: string[] = [];
		const ctx = {
			credentials: {
				getToken: async (host: string) => {
					hosts.push(host);
					return "fixture-token";
				},
			},
		} as unknown as HostServiceContext;
		const client = await createGitLabSearchClient(ctx, targets[1].repo);
		expect(client.host).toBe("git.example.invalid:8443");
		expect(hosts).toEqual(["git.example.invalid:8443"]);
	});
}
