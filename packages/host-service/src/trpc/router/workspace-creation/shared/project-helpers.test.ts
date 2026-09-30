import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import {
	createTestHost,
	type TestHost,
} from "../../../../../test/helpers/createTestHost";
import { projects } from "../../../../db/schema";
import { createGitLabClient } from "../../../../source-control/gitlab/gitlab";
import type { HostServiceContext } from "../../../../types";
import { resolveGitLabRepo } from "./project-helpers";

const directories: string[] = [];
const hosts: TestHost[] = [];

afterEach(async () => {
	for (const host of hosts.splice(0)) await host.dispose();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe("live GitLab project identity", () => {
	test("uses the configured API instance instead of a custom SSH port", async () => {
		const directory = mkdtempSync(join(tmpdir(), "gitlab-ssh-project-"));
		directories.push(directory);
		const git = simpleGit(directory);
		await git.init();
		await git.addRemote(
			"origin",
			"ssh://git@code.example.com:2222/team/subgroup/repo.git",
		);
		const host = await createTestHost();
		hosts.push(host);
		host.db
			.insert(projects)
			.values({
				id: "project-ssh",
				repoPath: directory,
				repoProvider: "gitlab",
				repoInstance: "https://code.example.com:8443",
				name: "repo",
			})
			.run();
		const instances: string[] = [];
		const ctx = {
			db: host.db,
			eventBus: host.eventBus,
			gitlab: createGitLabClient({
				runner: async ({ instance }) => {
					instances.push(instance);
					return {
						id: 25,
						path_with_namespace: "team/subgroup/repo",
						web_url: "https://code.example.com:8443/team/subgroup/repo",
					};
				},
			}),
		} as HostServiceContext;

		const resolved = await resolveGitLabRepo(ctx, "project-ssh");
		expect(resolved).toMatchObject({
			instance: "https://code.example.com:8443",
			repoPath: "team/subgroup/repo",
			projectId: 25,
		});
		expect(instances).toEqual(["https://code.example.com:8443"]);
	});

	test("prefers the configured remote and updates provider identity after a repoint", async () => {
		const directory = mkdtempSync(join(tmpdir(), "gitlab-project-"));
		directories.push(directory);
		const git = simpleGit(directory);
		await git.init();
		await git.addRemote("origin", "https://github.com/old/repo.git");
		await git.addRemote("upstream", "https://gitlab.com/team/first.git");
		const host = await createTestHost();
		hosts.push(host);
		host.db
			.insert(projects)
			.values({
				id: "project-1",
				repoPath: directory,
				repoProvider: "github",
				repoInstance: "https://github.com",
				repoOwner: "old",
				repoName: "repo",
				repoUrl: "https://github.com/old/repo",
				remoteName: "upstream",
				name: "repo",
			})
			.run();
		const gitlab = createGitLabClient({
			runner: async ({ endpoint }) => {
				const repoPath = decodeURIComponent(endpoint.slice("projects/".length));
				return {
					id: repoPath === "team/first" ? 11 : 22,
					path_with_namespace: repoPath,
					web_url: `https://gitlab.com/${repoPath}`,
				};
			},
		});
		const ctx = {
			db: host.db,
			eventBus: host.eventBus,
			gitlab,
		} as HostServiceContext;

		const first = await resolveGitLabRepo(ctx, "project-1");
		expect(first).toMatchObject({
			provider: "gitlab",
			instance: "https://gitlab.com",
			repoPath: "team/first",
			projectId: 11,
		});
		expect(realpathSync(first.repoPathLocal)).toBe(realpathSync(directory));
		expect(
			host.db.query.projects
				.findFirst({ where: eq(projects.id, "project-1") })
				.sync(),
		).toMatchObject({
			repoProvider: "gitlab",
			repoProjectId: 11,
			remoteName: "upstream",
		});

		await git.remote([
			"set-url",
			"upstream",
			"https://gitlab.com/team/second.git",
		]);
		const second = await resolveGitLabRepo(ctx, "project-1");
		expect(second).toMatchObject({ repoPath: "team/second", projectId: 22 });
		expect(
			host.db.query.projects
				.findFirst({ where: eq(projects.id, "project-1") })
				.sync(),
		).toMatchObject({
			repoOwner: "team",
			repoName: "second",
			repoProjectId: 22,
		});
	});
});
