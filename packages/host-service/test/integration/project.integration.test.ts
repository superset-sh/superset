import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { TRPCClientError } from "@trpc/client";
import { cloudOk } from "../helpers/cloud-fakes";
import { createTestHost } from "../helpers/createTestHost";
import { createGitFixture } from "../helpers/git-fixture";
import { createProjectScenario } from "../helpers/scenarios";
import { seedProject } from "../helpers/seed";

describe("project router integration", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("list returns rows from db", async () => {
		const host = await createTestHost();
		const repo = await createGitFixture();
		dispose = async () => {
			await host.dispose();
			repo.dispose();
		};

		const a = seedProject(host, { repoPath: repo.repoPath, repoName: "alpha" });
		const b = seedProject(host, {
			repoPath: `${repo.repoPath}-other`,
			repoName: "beta",
		});

		const result = await host.trpc.project.list.query();
		const ids = result.map((p) => p.id).sort();
		expect(ids).toEqual([a.id, b.id].sort());
	});

	test("get returns project by id, null when missing", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		const found = await scenario.host.trpc.project.get.query({
			projectId: scenario.projectId,
		});
		expect(found?.id).toBe(scenario.projectId);
		expect(found?.repoPath).toBe(scenario.repo.repoPath);

		const missing = await scenario.host.trpc.project.get.query({
			projectId: randomUUID(),
		});
		expect(missing).toBeNull();
	});

	test("get rejects non-uuid projectId via zod", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.project.get.query({ projectId: "not-a-uuid" }),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("findBackfillConflict always returns conflict: null", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.project.findBackfillConflict.query({
			projectId: randomUUID(),
			repoPath: scenario.repo.repoPath,
		});
		expect(result).toEqual({ conflict: null });
	});

	test("findByPath returns local match without hitting cloud api", async () => {
		const host = await createTestHost();
		const repo = await createGitFixture();
		dispose = async () => {
			await host.dispose();
			repo.dispose();
		};

		const { id } = seedProject(host, {
			repoPath: repo.repoPath,
			repoName: "local-name",
		});

		const result = await host.trpc.project.findByPath.query({
			repoPath: repo.repoPath,
		});
		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0]).toEqual({ id, name: "local-name" });
		expect(
			host.apiCalls.some(
				(c) => c.path === "v2Project.findByGitHubRemote.query",
			),
		).toBe(false);
	});

	test("findByPath returns empty candidates when repo has no parsed remote and no local project", async () => {
		const host = await createTestHost();
		const repo = await createGitFixture();
		dispose = async () => {
			await host.dispose();
			repo.dispose();
		};

		const result = await host.trpc.project.findByPath.query({
			repoPath: repo.repoPath,
		});
		expect(result.candidates).toEqual([]);
	});

	test("findByPath falls back to cloud when no local project + parseable remote", async () => {
		const host = await createTestHost({
			apiOverrides: {
				"v2Project.findByGitHubRemote.query":
					cloudOk.v2ProjectFindByGitHubRemote([
						{ id: "cloud-project-id", name: "octocat/hello" },
					]),
			},
		});
		const repo = await createGitFixture();
		await repo.git.addRemote("origin", "https://github.com/octocat/hello.git");
		dispose = async () => {
			await host.dispose();
			repo.dispose();
		};

		const result = await host.trpc.project.findByPath.query({
			repoPath: repo.repoPath,
		});
		expect(result.candidates).toEqual([
			{ id: "cloud-project-id", name: "octocat/hello" },
		]);
		expect(
			host.apiCalls.some(
				(c) => c.path === "v2Project.findByGitHubRemote.query",
			),
		).toBe(true);
	});
});
