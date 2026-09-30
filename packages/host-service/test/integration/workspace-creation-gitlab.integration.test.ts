import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
import { projects } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

async function seedProject(
	host: TestHost,
	projectId: string,
	instance: string,
): Promise<string> {
	const repoPath = mkdtempSync(join(tmpdir(), "gitlab-issue-route-"));
	const git = simpleGit(repoPath);
	await git.init(["--initial-branch=main"]);
	await git.addRemote("origin", `${instance}/group/subgroup/project.git`);
	host.db
		.insert(projects)
		.values({
			id: projectId,
			repoPath,
			repoProvider: "gitlab",
			repoInstance: instance,
			remoteName: "origin",
		})
		.run();
	return repoPath;
}

describe("GitLab issue host routes", () => {
	let host: TestHost;
	let repoPaths: string[];
	const firstProjectId = randomUUID();
	const secondProjectId = randomUUID();
	const firstInstance = "https://gitlab.com";
	const secondInstance = "https://gitlab.example.com:8443";
	const calls: Array<{ instance: string; endpoint: string }> = [];

	beforeEach(async () => {
		calls.length = 0;
		host = await createTestHost({
			execGlab: async ({ instance, endpoint }) => {
				calls.push({ instance, endpoint });
				const numericProjectId = instance === firstInstance ? 11 : 22;
				if (endpoint === "projects/group%2Fsubgroup%2Fproject") {
					return {
						id: numericProjectId,
						path_with_namespace: "group/subgroup/project",
						web_url: `${instance}/group/subgroup/project`,
					};
				}
				const issue = {
					iid: 42,
					title: `Issue on ${instance}`,
					description: `Issue body on ${instance}`,
					web_url: `${instance}/group/subgroup/project/-/issues/42`,
					state: "opened",
					author: { username: "alice.name_1" },
					created_at: "2026-09-01T00:00:00Z",
					updated_at: "2026-09-02T00:00:00Z",
					project_id: numericProjectId,
				};
				if (endpoint === `projects/${numericProjectId}/issues/42`) {
					return issue;
				}
				if (endpoint.startsWith(`projects/${numericProjectId}/issues?`)) {
					return [issue];
				}
				throw new Error(`Unexpected GitLab request: ${endpoint}`);
			},
		});
		repoPaths = [
			await seedProject(host, firstProjectId, firstInstance),
			await seedProject(host, secondProjectId, secondInstance),
		];
	});

	afterEach(async () => {
		await host.dispose();
		for (const repoPath of repoPaths) {
			rmSync(repoPath, { recursive: true, force: true });
		}
	});

	test("search keeps the same IID on two instances distinct", async () => {
		const result = await host.trpc.workspaceCreation.searchGitLabIssues.query({
			projectId: firstProjectId,
			projectIds: [firstProjectId, secondProjectId],
			query: "#42",
		});
		expect(
			result.issues.map((item) => [item.projectId, item.instance]),
		).toEqual([
			[firstProjectId, firstInstance],
			[secondProjectId, secondInstance],
		]);
		expect(result.issues[1]?.body).toBe(`Issue body on ${secondInstance}`);
		expect(calls.some((call) => call.endpoint.includes("iids%5B%5D=42"))).toBe(
			true,
		);
	});

	test("detail uses the selected instance and validates the live remote", async () => {
		const content = await host.trpc.issues.getContent.query({
			projectId: secondProjectId,
			issueNumber: 42,
			provider: "gitlab",
			instance: secondInstance,
			repoPath: "group/subgroup/project",
		});
		expect(content).toMatchObject({
			number: 42,
			body: `Issue body on ${secondInstance}`,
			state: "open",
		});
		await expect(
			host.trpc.issues.getContent.query({
				projectId: secondProjectId,
				issueNumber: 42,
				provider: "gitlab",
				instance: firstInstance,
				repoPath: "group/subgroup/project",
			}),
		).rejects.toThrow("does not match");
	});
});
