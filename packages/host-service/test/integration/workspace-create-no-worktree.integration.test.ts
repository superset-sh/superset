import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";

/** How many worktrees git itself reports, the repo folder included. */
async function countWorktrees(git: {
	raw: (args: string[]) => Promise<string>;
}): Promise<number> {
	const listed = await git.raw(["worktree", "list", "--porcelain"]);
	return listed.match(/^worktree /gm)?.length ?? 0;
}

/**
 * `workspaces.create({ noWorktree: true })`: the workspace is the project
 * folder itself. These tests assert against the real repo on disk: which
 * branch it ends up on, and that no worktree was added for it.
 */
describe("workspaces.create with noWorktree", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("returns the project's main workspace and leaves the branch alone", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			noWorktree: true,
		});

		expect(result.workspace.branch).toBe("main");
		expect(result.alreadyExists).toBe(true);

		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(persisted?.type).toBe("main");
		expect(persisted?.worktreePath).toBe(scenario.repo.repoPath);

		// One worktree in the list means the repo itself and nothing else.
		expect(await countWorktrees(scenario.repo.git)).toBe(1);
	});

	test("a second create with noWorktree returns the same workspace", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const first = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			noWorktree: true,
		});
		const second = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			noWorktree: true,
		});

		expect(second.workspace.id).toBe(first.workspace.id);
	});

	test("a branch is created in the project folder, not in a worktree", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			branch: "in-place",
			skipBranchPrefix: true,
			noWorktree: true,
		});

		expect(result.workspace.branch).toBe("in-place");

		const head = await scenario.repo.git.raw([
			"symbolic-ref",
			"--short",
			"HEAD",
		]);
		expect(head.trim()).toBe("in-place");
		expect(await countWorktrees(scenario.repo.git)).toBe(1);

		// The row follows the checkout, so the sidebar and every terminal
		// opened later report the branch the folder is really on.
		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(persisted?.branch).toBe("in-place");
	});

	test("an existing branch is checked out rather than re-created", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		await scenario.repo.git.raw(["branch", "already-here"]);

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			branch: "already-here",
			noWorktree: true,
		});

		expect(result.workspace.branch).toBe("already-here");
		const head = await scenario.repo.git.raw([
			"symbolic-ref",
			"--short",
			"HEAD",
		]);
		expect(head.trim()).toBe("already-here");
	});

	test("refuses to move a folder that has uncommitted changes", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		// A branch one commit ahead, so checking it out rewrites files.
		await scenario.repo.git.raw(["checkout", "-b", "ahead"]);
		await scenario.repo.commit("second commit");
		await scenario.repo.git.raw(["checkout", "main"]);

		writeFileSync(
			join(scenario.repo.repoPath, "README.md"),
			"edited but not committed",
		);

		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				branch: "ahead",
				noWorktree: true,
			}),
		).rejects.toThrow(/uncommitted changes/i);

		const head = await scenario.repo.git.raw([
			"symbolic-ref",
			"--short",
			"HEAD",
		]);
		expect(head.trim()).toBe("main");
	});

	test("keeps uncommitted work when the new branch starts at HEAD", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		// `git checkout -b` at the commit the folder is already on writes a
		// ref and nothing else, so work in progress is safe.
		writeFileSync(join(scenario.repo.repoPath, "README.md"), "still working");

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			branch: "carry-on",
			skipBranchPrefix: true,
			noWorktree: true,
		});

		expect(result.workspace.branch).toBe("carry-on");
		expect(
			readFileSync(join(scenario.repo.repoPath, "README.md"), "utf8"),
		).toBe("still working");
	});

	test("reports an untracked file in the way as a conflict", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		// git refuses to write over a file it does not track, and
		// `status --untracked-files=no` cannot see it coming.
		await scenario.repo.git.raw(["checkout", "-b", "has-dist"]);
		await scenario.repo.commit("add dist", { "dist.js": "built" });
		await scenario.repo.git.raw(["checkout", "main"]);
		writeFileSync(join(scenario.repo.repoPath, "dist.js"), "local build");

		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				branch: "has-dist",
				noWorktree: true,
			}),
		).rejects.toThrow(/Could not check out "has-dist"/);

		const head = await scenario.repo.git.raw([
			"symbolic-ref",
			"--short",
			"HEAD",
		]);
		expect(head.trim()).toBe("main");
	});

	test("refuses to start an agent in the project folder unasked", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		// The project folder is on `main`, so an ordinary create for `main`
		// resolves to it. Launching work there needs noWorktree.
		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				branch: "main",
				command: "echo hi",
			}),
		).rejects.toThrow(/checked out in the project folder/);
	});

	test("refuses a branch another worktree already has checked out", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const elsewhere = join(scenario.repo.repoPath, ".worktrees", "taken");
		await scenario.repo.git.raw(["worktree", "add", "-b", "taken", elsewhere]);

		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				branch: "taken",
				noWorktree: true,
			}),
		).rejects.toThrow(/already checked out/i);
	});

	test("rejects noWorktree together with pr", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				pr: 1,
				noWorktree: true,
			}),
		).rejects.toThrow();
	});
});
