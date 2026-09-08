import { afterEach, describe, expect, test } from "bun:test";
import { lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { projects, workspaceSetupRuns, workspaces } from "../../src/db/schema";
import { createProjectScenario } from "../helpers/scenarios";

function pathFor(
	s: Awaited<ReturnType<typeof createProjectScenario>>,
	id: string,
) {
	const path = s.host.db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, id))
		.get()?.worktreePath;
	if (!path) throw new Error("Expected a persisted worktree path");
	return path;
}

describe("workspace setup integration", () => {
	let dispose: (() => Promise<void>) | undefined;
	afterEach(async () => {
		await dispose?.();
		dispose = undefined;
	});
	async function scenario() {
		const s = await createProjectScenario();
		dispose = s.dispose;
		await s.repo.commit("ignore environment", {
			".gitignore": ".env\n.worktrees/\n",
		});
		s.host.db
			.update(projects)
			.set({ worktreeBaseDir: join(s.repo.repoPath, ".worktrees") })
			.where(eq(projects.id, s.projectId))
			.run();
		writeFileSync(join(s.repo.repoPath, ".env"), "fixture");
		await s.host.trpc.workspaceSetup.updateProject.mutate({
			projectId: s.projectId,
			sharedFilePaths: [".env"],
			defaultBaseRef: "refs/heads/main",
		});
		return s;
	}
	test("project settings persist and a new workspace links files before reaching ready", async () => {
		const s = await scenario();
		const settings = await s.host.trpc.workspaceSetup.getProject.query({
			projectId: s.projectId,
		});
		expect(settings.sharedFilePaths).toEqual([".env"]);
		expect(settings.defaultBaseRef).toBe("refs/heads/main");
		const result = await s.host.trpc.workspaces.create.mutate({
			projectId: s.projectId,
			branch: "test/shared",
			runSetup: false,
		});
		const state = await s.host.trpc.workspaceSetup.status.query({
			workspaceId: result.workspace.id,
		});
		expect(state?.status).toBe("ready");
		expect(
			lstatSync(join(pathFor(s, result.workspace.id), ".env")).isSymbolicLink(),
		).toBe(true);
		await s.repo.git.raw([
			"worktree",
			"remove",
			"--force",
			pathFor(s, result.workspace.id),
		]);
	});
	test("missing shared file keeps the workspace, then skips only for this workspace", async () => {
		const s = await scenario();
		rmSync(join(s.repo.repoPath, ".env"));
		const result = await s.host.trpc.workspaces.create.mutate({
			projectId: s.projectId,
			branch: "test/missing",
			runSetup: false,
		});
		let state = await s.host.trpc.workspaceSetup.status.query({
			workspaceId: result.workspace.id,
		});
		expect(state?.status).toBe("failed");
		expect(state?.failedPath).toBe(".env");
		const reopened = await s.host.trpc.workspaces.create.mutate({
			projectId: s.projectId,
			branch: "test/missing",
			agents: [{ agent: "codex", prompt: "must remain blocked" }],
		});
		expect(reopened.agents).toEqual([
			{
				ok: false,
				error:
					"Workspace setup must finish before another agent can start. Open the workspace to retry setup.",
			},
		]);
		expect(lstatSync(pathFor(s, result.workspace.id)).isDirectory()).toBe(true);
		await s.host.trpc.workspaceSetup.retry.mutate({
			workspaceId: result.workspace.id,
			skipFile: ".env",
		});
		state = await s.host.trpc.workspaceSetup.status.query({
			workspaceId: result.workspace.id,
		});
		expect(state?.status).toBe("ready");
		expect(state?.skippedFiles).toEqual([".env"]);
		expect(
			s.host.db
				.select()
				.from(projects)
				.where(eq(projects.id, s.projectId))
				.get()?.sharedFilePaths,
		).toEqual([".env"]);
		await s.repo.git.raw([
			"worktree",
			"remove",
			"--force",
			pathFor(s, result.workspace.id),
		]);
	});
	test("retry links a restored file in the same workspace", async () => {
		const s = await scenario();
		rmSync(join(s.repo.repoPath, ".env"));
		const result = await s.host.trpc.workspaces.create.mutate({
			projectId: s.projectId,
			branch: "test/retry",
			runSetup: false,
		});
		writeFileSync(join(s.repo.repoPath, ".env"), "restored");
		await s.host.trpc.workspaceSetup.retry.mutate({
			workspaceId: result.workspace.id,
		});
		expect(
			(
				await s.host.trpc.workspaceSetup.status.query({
					workspaceId: result.workspace.id,
				})
			)?.status,
		).toBe("ready");
		expect(
			readFileSync(join(pathFor(s, result.workspace.id), ".env"), "utf8"),
		).toBe("restored");
		expect(s.host.db.select().from(workspaceSetupRuns).all()).toHaveLength(1);
		await s.repo.git.raw([
			"worktree",
			"remove",
			"--force",
			pathFor(s, result.workspace.id),
		]);
	});
	test("attachment preserves the existing checkout and runs no setup", async () => {
		const s = await scenario();
		const result = await s.host.trpc.workspaces.create.mutate({
			projectId: s.projectId,
			branch: "main",
		});
		expect(
			s.host.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, result.workspace.id))
				.get()?.worktreePath,
		).toBe(s.repo.repoPath);
		expect(
			await s.host.trpc.workspaceSetup.status.query({
				workspaceId: result.workspace.id,
			}),
		).toBeNull();
		expect(lstatSync(join(s.repo.repoPath, ".env")).isSymbolicLink()).toBe(
			false,
		);
	});
	test("enqueued refresh failure includes explicit cached-base recovery and creates no workspace", async () => {
		const s = await scenario();
		await s.repo.git.addRemote("origin", join(s.repo.repoPath, "missing.git"));
		const commit = (await s.repo.git.revparse(["HEAD"])).trim();
		await s.repo.git.raw(["update-ref", "refs/remotes/origin/main", commit]);
		const captured: Array<{
			ok: boolean;
			baseRefRecovery?: { ref: string; commit: string | null };
		}> = [];
		const broadcast = s.host.eventBus.broadcastWorkspaceCreateSettled.bind(
			s.host.eventBus,
		);
		s.host.eventBus.broadcastWorkspaceCreateSettled = (event) => {
			captured.push(event);
			broadcast(event);
		};
		const id = crypto.randomUUID();
		await s.host.trpc.workspaces.createEnqueued.mutate({
			id,
			projectId: s.projectId,
			branch: "test/offline",
			baseBranch: "origin/main",
		});
		for (let i = 0; i < 200 && !captured.length; i++)
			await new Promise((resolve) => setTimeout(resolve, 25));
		expect(captured[0]?.ok).toBe(false);
		expect(captured[0]?.baseRefRecovery).toMatchObject({
			ref: "origin/main",
			commit,
		});
		expect(
			s.host.db.select().from(workspaces).where(eq(workspaces.id, id)).get(),
		).toBeUndefined();
		const result = await s.host.trpc.workspaces.create.mutate({
			id,
			projectId: s.projectId,
			branch: "test/offline",
			baseBranch: "origin/main",
			cachedBase: { ref: "origin/main", commit },
			runSetup: false,
		});
		expect(
			(
				await s.repo.git.raw(["-C", pathFor(s, id), "rev-parse", "HEAD"])
			).trim(),
		).toBe(commit);
		expect(
			(
				await s.host.trpc.workspaceSetup.status.query({
					workspaceId: result.workspace.id,
				})
			)?.base,
		).toMatchObject({ commit, usedCache: true });
	});
});
