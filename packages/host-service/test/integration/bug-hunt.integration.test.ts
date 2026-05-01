/**
 * Deliberate bug-hunting suite. Each test probes a hazard the code should
 * defend against. A passing test = defense holds; a failing test = real
 * bug worth fixing.
 *
 * Categories:
 *   - sandbox / path traversal in workspace-fs operations
 *   - shell-arg / git-flag injection through user-controlled refs
 *   - idempotency / double-fire correctness
 *   - auth-header parsing edge cases
 *   - partial-failure consistency
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("bug-hunt: filesystem sandbox", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();
	const workspaceId = randomUUID();

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: repo.repoPath,
				branch: "main",
			})
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	test("writeFile rejects '..' traversal escaping the workspace root", async () => {
		const escapeWritePath = `${repo.repoPath}/../escape.txt`;
		await expect(
			host.trpc.filesystem.writeFile.mutate({
				workspaceId,
				absolutePath: escapeWritePath,
				content: "should not exist",
				options: { create: true, overwrite: true },
			}),
		).rejects.toThrow();
		// Sibling of repoPath must not have been written.
		expect(existsSync(escapeWritePath)).toBe(false);
	});

	test("readFile rejects paths outside the workspace root", async () => {
		// Try to read the test repo's parent /etc/hostname-equivalent
		await expect(
			host.trpc.filesystem.readFile.query({
				workspaceId,
				absolutePath: `${repo.repoPath}/../../../etc/hosts`,
				encoding: "utf8",
			}),
		).rejects.toThrow();
	});

	test("deletePath rejects targets outside the workspace root", async () => {
		// Make a sibling we shouldn't be able to delete.
		const sibling = join(repo.repoPath, "..", "do-not-delete");
		mkdirSync(sibling, { recursive: true });
		writeFileSync(join(sibling, "marker"), "x");

		await expect(
			host.trpc.filesystem.deletePath.mutate({
				workspaceId,
				absolutePath: sibling,
			}),
		).rejects.toThrow();
		expect(existsSync(join(sibling, "marker"))).toBe(true);

		// Cleanup
		const { rmSync } = await import("node:fs");
		rmSync(sibling, { recursive: true, force: true });
	});

	test("movePath rejects destinations outside the workspace root", async () => {
		const src = join(repo.repoPath, "src.txt");
		writeFileSync(src, "src");
		const escapePath = join(repo.repoPath, "..", "escape-mv.txt");

		await expect(
			host.trpc.filesystem.movePath.mutate({
				workspaceId,
				sourceAbsolutePath: src,
				destinationAbsolutePath: escapePath,
			}),
		).rejects.toThrow();
		expect(existsSync(escapePath)).toBe(false);
		expect(existsSync(src)).toBe(true);
	});

	test("statPath does not crash on tilde paths when HOME is unset", async () => {
		const oldHome = process.env.HOME;
		const oldUserprofile = process.env.USERPROFILE;
		delete process.env.HOME;
		delete process.env.USERPROFILE;
		try {
			const result = await host.trpc.filesystem.statPath.mutate({
				workspaceId,
				path: "~/some-file",
			});
			expect(result).toBeNull();
		} finally {
			if (oldHome !== undefined) process.env.HOME = oldHome;
			if (oldUserprofile !== undefined)
				process.env.USERPROFILE = oldUserprofile;
		}
	});

	test("listDirectory rejects absolute paths outside workspace root", async () => {
		await expect(
			host.trpc.filesystem.listDirectory.query({
				workspaceId,
				absolutePath: "/etc",
			}),
		).rejects.toThrow();
	});
});

describe("bug-hunt: git-flag injection", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();
	const workspaceId = randomUUID();

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: repo.repoPath,
				branch: "main",
			})
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	test("setBaseBranch with a flag-shaped value stores it as a literal config value", async () => {
		// `git config branch.main.base --global` would only be a flag-injection
		// risk if simple-git ran a shell — it doesn't (argv spawn), so the
		// value lands as literal text. Pin that round-trip behavior.
		await host.trpc.git.setBaseBranch.mutate({
			workspaceId,
			baseBranch: "--global",
		});
		const round = await host.trpc.git.getBaseBranch.query({ workspaceId });
		expect(round.baseBranch).toBe("--global");
	});

	test("renameBranch with a flag-shaped new name has no destructive side effect", async () => {
		await repo.git.checkoutLocalBranch("rename-target");
		host.db
			.update(workspaces)
			.set({ branch: "rename-target" })
			.where(eq(workspaces.id, workspaceId))
			.run();

		await host.trpc.git.renameBranch
			.mutate({
				workspaceId,
				oldName: "rename-target",
				newName: "--force",
			})
			.catch(() => {});

		const branches = await repo.git.branchLocal();
		// Either git refused the rename (target still there) or accepted
		// `--force` as a literal branch name — never both gone, never main
		// affected.
		expect(
			branches.all.includes("rename-target") ||
				branches.all.includes("--force"),
		).toBe(true);
		expect(branches.all).toContain("main");
	});
});

describe("bug-hunt: idempotency + double-fire", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();
	const _workspaceId = randomUUID();

	beforeEach(async () => {
		repo = await createGitFixture();
	});

	afterEach(async () => {
		if (host) await host.dispose();
		repo.dispose();
	});

	test("workspaceCleanup.destroy is idempotent on a non-existent workspace id", async () => {
		host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": () => null,
				"v2Workspace.delete.mutate": () => ({ success: true }),
			},
		});
		const id = randomUUID();
		const a = await host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: id,
		});
		const b = await host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: id,
		});
		expect(a.success).toBe(true);
		expect(b.success).toBe(true);
	});

	test("project.remove is idempotent across two calls", async () => {
		host = await createTestHost();
		const id = randomUUID();
		const a = await host.trpc.project.remove.mutate({ projectId: id });
		const b = await host.trpc.project.remove.mutate({ projectId: id });
		expect(a).toEqual({ success: true });
		expect(b).toEqual({ success: true });
	});

	test("two concurrent workspace.create calls with the same branch don't collide silently", async () => {
		host = await createTestHost({
			apiOverrides: {
				"host.ensure.mutate": () => ({ machineId: "m1" }),
				"v2Workspace.create.mutate": (input: unknown) => {
					const i = input as { branch: string; name: string };
					return {
						id: randomUUID(),
						projectId,
						branch: i.branch,
						name: i.name,
					};
				},
			},
		});
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();

		await Promise.allSettled([
			host.trpc.workspace.create.mutate({
				projectId,
				name: "w",
				branch: "feature/race",
			}),
			host.trpc.workspace.create.mutate({
				projectId,
				name: "w",
				branch: "feature/race",
			}),
		]);

		// We must never end up with more than one workspace row pointing
		// at the same branch — that's the actual collision we're guarding
		// against. Either both calls collide (one row, one error) or git's
		// own worktree-add lock causes one to fail; never two rows.
		const rows = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.projectId, projectId))
			.all();
		const featureRows = rows.filter((r) => r.branch === "feature/race");
		expect(featureRows.length).toBeLessThanOrEqual(1);
	});
});

describe("bug-hunt: auth header parsing", () => {
	let host: TestHost;

	beforeEach(async () => {
		host = await createTestHost();
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("Bearer with empty token is rejected", async () => {
		const res = await host.fetch("http://host-service.test/events", {
			headers: { authorization: "Bearer " },
		});
		expect(res.status).toBe(401);
	});

	test("Bearer with leading whitespace is rejected", async () => {
		const res = await host.fetch("http://host-service.test/events", {
			headers: { authorization: `Bearer  ${host.psk}` },
		});
		expect(res.status).toBe(401);
	});

	test("token query param with multiple values uses only the first (or rejects)", async () => {
		// Hono's `c.req.query("token")` returns the first match. Make sure
		// a wrong-then-right pair doesn't authenticate.
		const res = await host.fetch(
			`http://host-service.test/events?token=wrong&token=${encodeURIComponent(host.psk)}`,
		);
		expect(res.status).toBe(401);
	});

	test("Authorization with non-Bearer scheme is rejected", async () => {
		const res = await host.fetch("http://host-service.test/events", {
			headers: { authorization: `Basic ${host.psk}` },
		});
		expect(res.status).toBe(401);
	});
});

describe("bug-hunt: SQL/identifier injection smoke", () => {
	let host: TestHost;

	beforeEach(async () => {
		host = await createTestHost();
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("workspace.get with id containing SQL meta is safe (drizzle params)", async () => {
		// Should resolve to NOT_FOUND, not 500 / SQL error.
		await expect(
			host.trpc.workspace.get.query({ id: "x'; DROP TABLE workspaces;--" }),
		).rejects.toBeInstanceOf(TRPCClientError);

		// Table still exists. A second NOT_FOUND with a benign id proves
		// the schema is intact — assert the rejection explicitly instead
		// of swallowing it, otherwise a schema corruption would silently
		// pass this test.
		await expect(
			host.trpc.workspace.get.query({ id: "no-such-row" }),
		).rejects.toBeInstanceOf(TRPCClientError);
	});
});
