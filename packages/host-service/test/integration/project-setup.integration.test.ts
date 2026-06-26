import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
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

describe("project.setup import — non-git folder (issue #4340)", () => {
	let host: TestHost;
	let plainDir: string;

	beforeEach(() => {
		// A plain directory that is NOT a git repo. This is the scenario
		// users hit when they pick a normal folder via the v2 import flow.
		plainDir = realpathSync(
			mkdtempSync(join(tmpdir(), "issue-4340-not-a-git-repo-")),
		);
	});

	afterEach(async () => {
		if (host) await host.dispose();
		rmSync(plainDir, { recursive: true, force: true });
	});

	// Issue #4340: "import project in v2 should git init if not git repository,
	// ask user". The v2 import flow currently rejects any folder that isn't
	// already a git repo with a generic "Not a git repository" TRPC error —
	// there is no `initGitIfMissing` option on the input and no structured
	// outcome the frontend could use to detect this case and prompt the
	// user. This locks in the current (undesired) behavior so that the
	// fix — accepting the non-git path and offering to `git init` — has a
	// clear regression target.
	test("rejects a non-git folder with a generic error and offers no init-git affordance", async () => {
		const projectId = randomUUID();
		host = await createTestHost({
			apiOverrides: {
				"v2Project.get.query": () => ({ id: projectId, repoCloneUrl: null }),
			},
		});

		await expect(
			host.trpc.project.setup.mutate({
				projectId,
				mode: { kind: "import", repoPath: plainDir },
			}),
		).rejects.toThrow(/Not a git repository/i);
	});

	// Same gap on the create side: `project.create` mode "importLocal" calls
	// `resolveLocalRepo` directly, so importing a non-git folder also fails
	// hard with no way to opt into git-init.
	test("create importLocal also rejects a non-git folder with no init-git affordance", async () => {
		host = await createTestHost();

		await expect(
			host.trpc.project.create.mutate({
				name: "issue-4340",
				mode: { kind: "importLocal", repoPath: plainDir },
			}),
		).rejects.toThrow(/Not a git repository/i);
	});
});
