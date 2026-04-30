import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { TRPCClientError } from "@trpc/client";
import { projects } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("project router integration", () => {
	let host: TestHost;
	let repo: GitFixture;

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	test("list returns rows from db", async () => {
		const aId = randomUUID();
		const bId = randomUUID();
		host.db
			.insert(projects)
			.values([
				{ id: aId, repoPath: repo.repoPath, repoName: "alpha" },
				{ id: bId, repoPath: `${repo.repoPath}-other`, repoName: "beta" },
			])
			.run();

		const result = await host.trpc.project.list.query();
		const ids = result.map((p) => p.id).sort();
		expect(ids).toEqual([aId, bId].sort());
	});

	test("get returns project by id, null when missing", async () => {
		const id = randomUUID();
		host.db.insert(projects).values({ id, repoPath: repo.repoPath }).run();

		const found = await host.trpc.project.get.query({ projectId: id });
		expect(found?.id).toBe(id);
		expect(found?.repoPath).toBe(repo.repoPath);

		const missing = await host.trpc.project.get.query({
			projectId: randomUUID(),
		});
		expect(missing).toBeNull();
	});

	test("get rejects non-uuid projectId via zod", async () => {
		expect(
			host.trpc.project.get.query({ projectId: "not-a-uuid" }),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("findBackfillConflict always returns conflict: null", async () => {
		const result = await host.trpc.project.findBackfillConflict.query({
			projectId: randomUUID(),
			repoPath: repo.repoPath,
		});
		expect(result).toEqual({ conflict: null });
	});

	test("findByPath returns local match without hitting cloud api", async () => {
		const id = randomUUID();
		host.db
			.insert(projects)
			.values({ id, repoPath: repo.repoPath, repoName: "local-name" })
			.run();

		const result = await host.trpc.project.findByPath.query({
			repoPath: repo.repoPath,
		});
		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0]).toEqual({ id, name: "local-name" });
		// no cloud call should have happened
		expect(
			host.apiCalls.some(
				(c) => c.path === "v2Project.findByGitHubRemote.query",
			),
		).toBe(false);
	});

	test("findByPath returns empty candidates when repo has no parsed remote", async () => {
		const result = await host.trpc.project.findByPath.query({
			repoPath: repo.repoPath,
		});
		expect(result.candidates).toEqual([]);
	});

	test("findByPath falls back to cloud when no local project + parseable remote", async () => {
		await repo.git.addRemote("origin", "https://github.com/octocat/hello.git");
		await host.dispose();
		host = await createTestHost({
			apiOverrides: {
				"v2Project.findByGitHubRemote.query": () => ({
					candidates: [{ id: "cloud-project-id", name: "octocat/hello" }],
				}),
			},
		});

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
