import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { projects } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("project.setup error paths", () => {
	let host: TestHost;
	let repo: GitFixture;

	beforeEach(async () => {
		repo = await createGitFixture();
	});

	afterEach(async () => {
		if (host) await host.dispose();
		repo.dispose();
	});

	test("rejects clone when cloud project has no repoCloneUrl", async () => {
		host = await createTestHost({
			apiOverrides: {
				"v2Project.get.query": () => ({ id: randomUUID(), repoCloneUrl: null }),
			},
		});

		await expect(
			host.trpc.project.setup.mutate({
				projectId: randomUUID(),
				mode: { kind: "clone", parentDir: "/tmp/parent-does-not-matter" },
			}),
		).rejects.toThrow(/no linked GitHub repository/i);
	});

	test("rejects clone when cloud repoCloneUrl is unparseable", async () => {
		host = await createTestHost({
			apiOverrides: {
				"v2Project.get.query": () => ({
					id: randomUUID(),
					repoCloneUrl: "not-a-github-url",
				}),
			},
		});

		await expect(
			host.trpc.project.setup.mutate({
				projectId: randomUUID(),
				mode: { kind: "clone", parentDir: "/tmp/parent-does-not-matter" },
			}),
		).rejects.toThrow(/Could not parse GitHub remote/i);
	});

	test("rejects re-pointing existing project to a different path without allowRelocate", async () => {
		const projectId = randomUUID();
		host = await createTestHost({
			apiOverrides: {
				"v2Project.get.query": () => ({
					id: projectId,
					repoCloneUrl: "https://github.com/octocat/hello.git",
				}),
			},
		});

		// project already set up at repo.repoPath
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();

		await expect(
			host.trpc.project.setup.mutate({
				projectId,
				mode: { kind: "clone", parentDir: "/tmp/some-other-parent" },
			}),
		).rejects.toThrow(/already set up on this device/i);
	});

	test("rejects setup with a non-uuid projectId at validation", async () => {
		host = await createTestHost();
		await expect(
			host.trpc.project.setup.mutate({
				projectId: "not-a-uuid",
				mode: { kind: "import", repoPath: repo.repoPath },
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("remove() is idempotent when project doesn't exist", async () => {
		host = await createTestHost({
			apiOverrides: {
				"v2Project.delete.mutate": () => ({ success: true }),
			},
		});
		const result = await host.trpc.project.remove.mutate({
			projectId: randomUUID(),
		});
		expect(result).toEqual({ success: true, repoPath: null });
	});
});

describe("project.setup with caller-supplied origin (cross-host local-first)", () => {
	let host: TestHost;
	let repo: GitFixture | undefined;

	afterEach(async () => {
		if (host) await host.dispose();
		repo?.dispose();
		repo = undefined;
	});

	test("import with origin never consults the cloud and applies the origin name", async () => {
		// No apiOverrides: any cloud call throws "unmocked procedure".
		host = await createTestHost();
		repo = await createGitFixture();
		const projectId = randomUUID();

		const result = await host.trpc.project.setup.mutate({
			projectId,
			origin: { repoCloneUrl: null, name: "From Host B" },
			mode: { kind: "import", repoPath: repo.repoPath, allowRelocate: false },
		});
		expect(result.repoPath).toBe(repo.repoPath);

		const row = host.db
			.select()
			.from(projects)
			.all()
			.find((p) => p.id === projectId);
		expect(row?.name).toBe("From Host B");
		expect(
			host.apiCalls.filter((c) => c.path.startsWith("v2Project.")),
		).toEqual([]);
	});

	test("clone with an unparseable origin repoCloneUrl fails without cloud calls", async () => {
		host = await createTestHost();

		await expect(
			host.trpc.project.setup.mutate({
				projectId: randomUUID(),
				origin: { repoCloneUrl: "/not/a/github/remote", name: "X" },
				mode: { kind: "clone", parentDir: "/tmp/parent-does-not-matter" },
			}),
		).rejects.toThrow(/Could not parse GitHub remote/i);
		expect(
			host.apiCalls.filter((c) => c.path.startsWith("v2Project.")),
		).toEqual([]);
	});
});

describe("project.create empty mode is fully local", () => {
	let host: TestHost;

	afterEach(async () => {
		if (host) await host.dispose();
	});

	test("creates repo dir, named row, and main workspace with zero cloud calls", async () => {
		host = await createTestHost();
		const parentDir = mkdtempSync(join(tmpdir(), "empty-mode-parent-"));
		// initEmptyRepo makes an initial commit; CI runners have no global
		// git identity, so provide one via env for this process's git spawns.
		const savedEnv = {
			GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME,
			GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL,
			GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
			GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
		};
		process.env.GIT_AUTHOR_NAME = "Test Runner";
		process.env.GIT_AUTHOR_EMAIL = "test@superset.sh";
		process.env.GIT_COMMITTER_NAME = "Test Runner";
		process.env.GIT_COMMITTER_EMAIL = "test@superset.sh";
		try {
			const created = await host.trpc.project.create.mutate({
				name: "Fresh Local",
				mode: { kind: "empty", parentDir },
			});
			expect(created.repoPath.startsWith(parentDir)).toBe(true);
			expect(created.mainWorkspaceId).toBeTruthy();
			expect(existsSync(join(created.repoPath, ".git"))).toBe(true);

			const row = host.db
				.select()
				.from(projects)
				.all()
				.find((p) => p.id === created.projectId);
			expect(row?.name).toBe("Fresh Local");
			expect(row?.updatedAt).toBeGreaterThan(0);
			expect(
				host.apiCalls.filter((c) => c.path.startsWith("v2Project.")),
			).toEqual([]);
		} finally {
			for (const [key, value] of Object.entries(savedEnv)) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
			rmSync(parentDir, { recursive: true, force: true });
		}
	});
});
