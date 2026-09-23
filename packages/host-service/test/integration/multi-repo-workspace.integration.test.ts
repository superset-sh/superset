import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import {
	projectFolders,
	workspaceRepos,
	workspaces,
} from "../../src/db/schema";
import { GitWatcher } from "../../src/events/git-watcher";
import { WorkspaceFilesystemManager } from "../../src/runtime/filesystem";
import { runMultiRepoBackfill } from "../../src/runtime/multi-repo-backfill";
import { runProjectGroupBackfill } from "../../src/runtime/project-group-backfill";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";
import { seedProject, seedWorkspace } from "../helpers/seed";

interface Scenario {
	host: TestHost;
	primary: GitFixture;
	secondary: GitFixture;
	projectId: string;
	secondaryProjectId: string;
	dispose(): Promise<void>;
}

async function createScenario(): Promise<Scenario> {
	const host = await createTestHost();
	const primary = await createGitFixture();
	const secondary = await createGitFixture();
	const { id: projectId } = seedProject(host, { repoPath: primary.repoPath });
	const { id: secondaryProjectId } = seedProject(host, {
		repoPath: secondary.repoPath,
	});
	return {
		host,
		primary,
		secondary,
		projectId,
		secondaryProjectId,
		dispose: async () => {
			await host.dispose();
			primary.dispose();
			secondary.dispose();
		},
	};
}

let scenario: Scenario | null = null;

afterEach(async () => {
	await scenario?.dispose();
	scenario = null;
});

function repoRows(host: TestHost, workspaceId: string) {
	return host.db
		.select()
		.from(workspaceRepos)
		.where(eq(workspaceRepos.workspaceId, workspaceId))
		.all()
		.sort((a, b) => a.position - b.position);
}

describe("multi-repo project folders", () => {
	test("a single-folder project still creates exactly today's workspace", async () => {
		scenario = await createScenario();
		const { host, primary, projectId } = scenario;

		const result = await host.trpc.workspaces.create.mutate({
			projectId,
			name: "solo",
			branch: "feature/solo",
			skipBranchPrefix: true,
			runSetup: false,
		});

		const row = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(row?.rootPath).toBeNull();
		expect(basename(row?.worktreePath ?? "")).toBe("solo");
		expect(existsSync(join(row?.worktreePath ?? "", ".git"))).toBe(true);
		expect(readdirSync(dirname(row?.worktreePath ?? ""))).toEqual(["solo"]);

		runMultiRepoBackfill({ db: host.db });
		const repos = repoRows(host, result.workspace.id);
		expect(repos).toHaveLength(1);
		expect(repos[0]?.position).toBe(0);
		expect(repos[0]?.worktreePath).toBe(row?.worktreePath ?? "");
		expect(repos[0]?.projectId).toBe(projectId);

		const worktrees = await primary.git.raw([
			"worktree",
			"list",
			"--porcelain",
		]);
		expect(worktrees).toContain(row?.worktreePath ?? "");
	});

	test("two folders produce one container with a worktree per folder", async () => {
		scenario = await createScenario();
		const { host, primary, secondary, projectId } = scenario;

		const added = await host.trpc.project.folders.add.mutate({
			projectId,
			repoPath: secondary.repoPath,
		});
		expect(added.folder.position).toBe(1);

		const result = await host.trpc.workspaces.create.mutate({
			projectId,
			name: "both",
			branch: "feature/both",
			skipBranchPrefix: true,
			runSetup: false,
		});

		const row = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		const container = row?.rootPath ?? "";
		expect(container).not.toBe("");

		const repos = repoRows(host, result.workspace.id);
		expect(repos).toHaveLength(2);
		expect(repos.map((repo) => repo.folder)).toEqual([
			basename(primary.repoPath),
			basename(secondary.repoPath),
		]);
		expect(repos.map((repo) => repo.branch)).toEqual([
			"feature/both",
			"feature/both",
		]);
		expect(row?.worktreePath).toBe(repos[0]?.worktreePath ?? "");
		expect(row?.worktreePath).not.toBe(container);
		for (const repo of repos) {
			expect(repo.worktreePath).toBe(join(container, repo.folder));
			expect(existsSync(join(repo.worktreePath, ".git"))).toBe(true);
		}

		for (const fixture of [primary, secondary]) {
			const list = await fixture.git.raw(["worktree", "list", "--porcelain"]);
			expect(list).not.toContain(`worktree ${container}\n`);
		}
	});

	test("deleting a multi-repo workspace removes every worktree and the container", async () => {
		scenario = await createScenario();
		const { host, primary, secondary, projectId } = scenario;

		await host.trpc.project.folders.add.mutate({
			projectId,
			repoPath: secondary.repoPath,
		});
		const result = await host.trpc.workspaces.create.mutate({
			projectId,
			name: "doomed",
			branch: "feature/doomed",
			skipBranchPrefix: true,
			runSetup: false,
		});
		const container =
			host.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, result.workspace.id))
				.get()?.rootPath ?? "";

		const destroyed = await host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: result.workspace.id,
			deleteBranch: true,
		});
		expect(destroyed.success).toBe(true);
		expect(destroyed.worktreeRemoved).toBe(true);
		expect(existsSync(container)).toBe(false);

		for (const fixture of [primary, secondary]) {
			const list = await fixture.git.raw(["worktree", "list", "--porcelain"]);
			expect(list).not.toContain(container);
			const branches = await fixture.git.raw(["branch", "--list"]);
			expect(branches).not.toContain("feature/doomed");
		}
	});

	test("extraProjectIds check out beside the primary without touching the project", async () => {
		scenario = await createScenario();
		const { host, secondary, projectId, secondaryProjectId } = scenario;

		const result = await host.trpc.workspaces.create.mutate({
			projectId,
			extraProjectIds: [secondaryProjectId],
			name: "adhoc",
			branch: "feature/adhoc",
			skipBranchPrefix: true,
			runSetup: false,
		});

		const repos = repoRows(host, result.workspace.id);
		expect(repos.map((repo) => repo.projectId)).toEqual([
			projectId,
			secondaryProjectId,
		]);
		expect(repos[1]?.folder).toBe(basename(secondary.repoPath));
		const folders = await host.trpc.project.folders.list.query({ projectId });
		expect(folders.folders).toHaveLength(1);
	});

	test("watches every checkout for git activity, not just the primary", async () => {
		scenario = await createScenario();
		const { host, secondary, projectId } = scenario;

		await host.trpc.project.folders.add.mutate({
			projectId,
			repoPath: secondary.repoPath,
		});
		const result = await host.trpc.workspaces.create.mutate({
			projectId,
			name: "watched",
			branch: "feature/watched",
			skipBranchPrefix: true,
			runSetup: false,
		});
		const expected = repoRows(host, result.workspace.id).map(
			(repo) => repo.worktreePath,
		);

		const filesystem = new WorkspaceFilesystemManager({ db: host.db });
		const watcher = new GitWatcher(host.db, filesystem, () => {});
		const watched = () => [
			...(
				watcher as unknown as {
					watched: Map<string, { worktreePath: string }>;
				}
			).watched.values(),
		];
		try {
			watcher.watchWorkspace(result.workspace.id);
			const deadline = Date.now() + 5_000;
			while (watched().length < expected.length && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			expect(
				watched()
					.map((entry) => entry.worktreePath)
					.sort(),
			).toEqual([...expected].sort());
		} finally {
			watcher.close();
			await filesystem.close();
		}
	});

	test("git procedures address a secondary checkout through `repo`", async () => {
		scenario = await createScenario();
		const { host, secondary, projectId } = scenario;

		await host.trpc.project.folders.add.mutate({
			projectId,
			repoPath: secondary.repoPath,
		});
		const result = await host.trpc.workspaces.create.mutate({
			projectId,
			name: "addressed",
			branch: "feature/addressed",
			skipBranchPrefix: true,
			runSetup: false,
		});
		const repos = repoRows(host, result.workspace.id);
		const secondaryFolder = repos[1]?.folder ?? "";

		const primaryStatus = await host.trpc.git.getBranchSyncStatus.query({
			workspaceId: result.workspace.id,
		});
		const secondaryStatus = await host.trpc.git.getBranchSyncStatus.query({
			workspaceId: result.workspace.id,
			repo: secondaryFolder,
		});
		expect(primaryStatus.currentBranch).toBe("feature/addressed");
		expect(secondaryStatus.currentBranch).toBe("feature/addressed");

		await expect(
			host.trpc.git.getBranchSyncStatus.query({
				workspaceId: result.workspace.id,
				repo: "nope",
			}),
		).rejects.toThrow(/no repo "nope"/);
	});
});

describe("a project over several source folders", () => {
	test("checks out every member and starts the agent in the primary", async () => {
		scenario = await createScenario();
		const { host, primary, secondary, projectId, secondaryProjectId } =
			scenario;

		const { group } = await host.trpc.projectGroups.create.mutate({
			name: "platform",
		});
		await host.trpc.projectGroups.addMember.mutate({
			groupId: group.id,
			projectId,
		});
		await host.trpc.projectGroups.addMember.mutate({
			groupId: group.id,
			projectId: secondaryProjectId,
			folder: "api",
		});

		const result = await host.trpc.workspaces.create.mutate({
			projectId,
			name: "platform-work",
			branch: "feature/platform",
			skipBranchPrefix: true,
			runSetup: false,
		});

		const row = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		const repos = repoRows(host, result.workspace.id);
		expect(repos.map((repo) => repo.projectId)).toEqual([
			projectId,
			secondaryProjectId,
		]);
		expect(repos.map((repo) => repo.folder)).toEqual([
			basename(primary.repoPath),
			"api",
		]);
		for (const repo of repos) {
			expect(repo.worktreePath).toBe(join(row?.rootPath ?? "", repo.folder));
			expect(existsSync(join(repo.worktreePath, ".git"))).toBe(true);
		}
		expect(row?.worktreePath).toBe(repos[0]?.worktreePath ?? "");

		const folders = await host.trpc.project.folders.list.query({ projectId });
		expect(folders.folders).toHaveLength(1);
		expect(folders.folders[0]?.repoPath).toBe(primary.repoPath);

		const list = await secondary.git.raw(["worktree", "list", "--porcelain"]);
		expect(list).toContain(repos[1]?.worktreePath ?? "");
	});

	test("checks out every member when the primary is also its own backfilled project", async () => {
		scenario = await createScenario();
		const { host, projectId, secondaryProjectId } = scenario;

		runProjectGroupBackfill({ db: host.db });
		const { group } = await host.trpc.projectGroups.create.mutate({
			name: "platform",
		});
		await host.trpc.projectGroups.addMember.mutate({
			groupId: group.id,
			projectId,
			folder: "web",
		});
		await host.trpc.projectGroups.addMember.mutate({
			groupId: group.id,
			projectId: secondaryProjectId,
			folder: "api",
		});

		const result = await host.trpc.workspaces.create.mutate({
			projectId,
			name: "platform-work",
			branch: "feature/platform-backfilled",
			skipBranchPrefix: true,
			runSetup: false,
		});

		const repos = repoRows(host, result.workspace.id);
		expect(repos.map((repo) => repo.projectId)).toEqual([
			projectId,
			secondaryProjectId,
		]);
		expect(repos.map((repo) => repo.folder)).toEqual(["web", "api"]);
	});

	test("a single-member project creates exactly the single-repo workspace", async () => {
		scenario = await createScenario();
		const { host, projectId } = scenario;

		const { group } = await host.trpc.projectGroups.create.mutate({
			name: "solo project",
		});
		await host.trpc.projectGroups.addMember.mutate({
			groupId: group.id,
			projectId,
		});

		const result = await host.trpc.workspaces.create.mutate({
			projectId,
			name: "solo",
			branch: "feature/solo",
			skipBranchPrefix: true,
			runSetup: false,
		});

		const row = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(row?.rootPath).toBeNull();
		expect(basename(row?.worktreePath ?? "")).toBe("solo");
	});
});

describe("multi-repo backfill", () => {
	test("materializes position-0 rows once and stays a no-op after", async () => {
		scenario = await createScenario();
		const { host, primary, projectId } = scenario;
		const { id: workspaceId } = seedWorkspace(host, {
			projectId,
			worktreePath: join(primary.repoPath, ".worktrees", "legacy"),
			branch: "legacy",
		});

		const first = runMultiRepoBackfill({ db: host.db });
		expect(first.repos).toBe(1);

		const folders = host.db
			.select()
			.from(projectFolders)
			.where(eq(projectFolders.projectId, projectId))
			.all();
		expect(folders).toHaveLength(1);
		expect(folders[0]?.position).toBe(0);
		expect(folders[0]?.repoPath).toBe(primary.repoPath);
		expect(folders[0]?.folder).toBe(basename(primary.repoPath));

		const repos = repoRows(host, workspaceId);
		expect(repos).toHaveLength(1);
		expect(repos[0]?.worktreePath).toBe(
			join(primary.repoPath, ".worktrees", "legacy"),
		);
		expect(repos[0]?.branch).toBe("legacy");

		const second = runMultiRepoBackfill({ db: host.db });
		expect(second).toEqual({ folders: 0, repos: 0 });
		expect(repoRows(host, workspaceId)).toHaveLength(1);
		expect(
			host.db
				.select()
				.from(projectFolders)
				.where(eq(projectFolders.projectId, projectId))
				.all(),
		).toHaveLength(1);
	});
});

describe("project folder CRUD", () => {
	test("add, rename, promote and remove keep positions contiguous", async () => {
		scenario = await createScenario();
		const { host, primary, secondary, projectId } = scenario;

		// The primary is materialized from the project row on first mutation.
		const { folder: added } = await host.trpc.project.folders.add.mutate({
			projectId,
			repoPath: secondary.repoPath,
			folder: "api",
		});
		expect(added.position).toBe(1);

		const listed = await host.trpc.project.folders.list.query({ projectId });
		expect(listed.folders.map((folder) => folder.position)).toEqual([0, 1]);
		expect(listed.folders[0]?.repoPath).toBe(primary.repoPath);

		const third = await createGitFixture();
		try {
			const { folder: duplicate } = await host.trpc.project.folders.add.mutate({
				projectId,
				repoPath: third.repoPath,
				folder: "api",
			});
			expect(duplicate.folder).toBe("api-2");

			await expect(
				host.trpc.project.folders.rename.mutate({
					projectId,
					folderId: duplicate.id,
					folder: "api",
				}),
			).rejects.toThrow(/already called "api"/);
			await expect(
				host.trpc.project.folders.rename.mutate({
					projectId,
					folderId: duplicate.id,
					folder: "../escape",
				}),
			).rejects.toThrow(/single directory name/);

			const renamed = await host.trpc.project.folders.rename.mutate({
				projectId,
				folderId: duplicate.id,
				folder: "worker",
			});
			expect(renamed.folder.folder).toBe("worker");

			const primaryFolder = listed.folders[0];
			await expect(
				host.trpc.project.folders.remove.mutate({
					projectId,
					folderId: primaryFolder?.id ?? "",
				}),
			).rejects.toThrow(/primary folder/);

			const promoted = await host.trpc.project.folders.setPrimary.mutate({
				projectId,
				folderId: added.id,
			});
			expect(promoted.folders.map((folder) => folder.folder)).toEqual([
				"api",
				primaryFolder?.folder ?? "",
				"worker",
			]);
			const project = await host.trpc.project.get.query({ projectId });
			expect(project?.repoPath).toBe(secondary.repoPath);

			const afterRemove = await host.trpc.project.folders.remove.mutate({
				projectId,
				folderId: duplicate.id,
			});
			expect(afterRemove.folders.map((folder) => folder.position)).toEqual([
				0, 1,
			]);
		} finally {
			third.dispose();
		}
	});
});
