import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { TRPCClientError } from "@trpc/client";
import { projects } from "../../src/db/schema";
import { cloudOk } from "../helpers/cloud-fakes";
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

	test("create returns cloud project and main workspace rows for immediate renderer hydration", async () => {
		host = await createTestHost({
			apiOverrides: {
				"v2Project.create.mutate": (input: unknown) => {
					const payload = input as {
						id: string;
						organizationId: string;
						name: string;
						slug: string;
						repoCloneUrl?: string | null;
					};
					return {
						id: payload.id,
						organizationId: payload.organizationId,
						name: payload.name,
						slug: payload.slug,
						repoCloneUrl: payload.repoCloneUrl ?? null,
						githubRepositoryId: null,
						iconUrl: null,
						createdAt: new Date("2026-01-01T00:00:00.000Z"),
						updatedAt: new Date("2026-01-01T00:00:00.000Z"),
						txid: 1,
					};
				},
				"host.ensure.mutate": cloudOk.hostEnsure("test-machine-1"),
				"v2Workspace.create.mutate": (input: unknown) => {
					const payload = input as {
						organizationId: string;
						projectId: string;
						name: string;
						branch: string;
						hostId: string;
						type: "main";
					};
					return {
						id: randomUUID(),
						organizationId: payload.organizationId,
						projectId: payload.projectId,
						hostId: payload.hostId,
						name: payload.name,
						branch: payload.branch,
						type: payload.type,
						createdByUserId: "user-1",
						taskId: null,
						createdAt: new Date("2026-01-01T00:00:00.000Z"),
						updatedAt: new Date("2026-01-01T00:00:00.000Z"),
						txid: 2,
					};
				},
			},
		});

		const result = await host.trpc.project.create.mutate({
			name: "Hydrate Me",
			mode: { kind: "importLocal", repoPath: repo.repoPath },
		});

		expect(result.projectId).toBe(result.project.id);
		expect(result.mainWorkspaceId).toBe(result.mainWorkspace.id);
		expect(result.project.name).toBe("Hydrate Me");
		expect(result.mainWorkspace.projectId).toBe(result.project.id);
		expect(JSON.stringify(result)).not.toContain("txid");
	});

	test("setup returns cloud project and main workspace rows for immediate renderer hydration", async () => {
		const projectId = randomUUID();
		host = await createTestHost({
			apiOverrides: {
				"v2Project.get.query": () => ({
					id: projectId,
					organizationId: "00000000-0000-0000-0000-000000000001",
					name: "Existing Project",
					slug: "existing-project",
					repoCloneUrl: null,
					githubRepositoryId: null,
					iconUrl: null,
					createdAt: new Date("2026-01-01T00:00:00.000Z"),
					updatedAt: new Date("2026-01-01T00:00:00.000Z"),
				}),
				"host.ensure.mutate": cloudOk.hostEnsure("test-machine-1"),
				"v2Workspace.create.mutate": (input: unknown) => {
					const payload = input as {
						organizationId: string;
						projectId: string;
						name: string;
						branch: string;
						hostId: string;
						type: "main";
					};
					return {
						id: randomUUID(),
						organizationId: payload.organizationId,
						projectId: payload.projectId,
						hostId: payload.hostId,
						name: payload.name,
						branch: payload.branch,
						type: payload.type,
						createdByUserId: "user-1",
						taskId: null,
						createdAt: new Date("2026-01-01T00:00:00.000Z"),
						updatedAt: new Date("2026-01-01T00:00:00.000Z"),
						txid: 2,
					};
				},
			},
		});

		const result = await host.trpc.project.setup.mutate({
			projectId,
			mode: { kind: "import", repoPath: repo.repoPath },
		});

		expect(result.project.id).toBe(projectId);
		expect(result.mainWorkspaceId).toBe(result.mainWorkspace?.id);
		expect(result.mainWorkspace?.projectId).toBe(projectId);
		expect(JSON.stringify(result)).not.toContain("txid");
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
