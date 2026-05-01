import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
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
