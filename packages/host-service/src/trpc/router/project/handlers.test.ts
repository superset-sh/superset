import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import type { HostServiceContext } from "../../../types";
import { createFromImportLocal } from "./handlers";

/**
 * Reproduction for #5183 — "Cannot create a new workspace from an internal
 * github repository".
 *
 * The user could not turn a local folder / internal-repo clone into a
 * workspace: the desktop app errored with "Couldn't reach cloud for
 * <url>: fetch failed". The root cause is that EVERY project-creation
 * handler funnels through `persistFromResolved`, which makes the Superset
 * cloud (`ctx.api.v2Project.create`) a hard, non-optional dependency. When
 * cloud is unreachable — an internal network, a firewall, or simply being
 * offline — there is no path to create a purely-local project, and the
 * local DB row that was already written gets rolled back, so the user is
 * left with nothing.
 *
 * These tests stand up a REAL on-disk git repo (so the local steps all
 * succeed) and a fake context whose cloud client throws the same
 * `fetch failed` transport error the user reported. They assert that
 * creation is impossible and that nothing usable persists.
 */

async function initRepoAt(path: string): Promise<SimpleGit> {
	mkdirSync(path, { recursive: true });
	const git = simpleGit(path);
	await git.init();
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await git.raw(["commit", "--allow-empty", "-m", "seed"]);
	return git;
}

interface FakeDbState {
	inserted: Array<{ id: string }>;
	deleted: string[];
}

/**
 * Minimal stand-in for the drizzle `HostDb` covering exactly the two
 * chains `persistFromResolved` exercises before/while it hits the cloud:
 * `insert(projects).values(...).onConflictDoUpdate(...).run()` and the
 * rollback `delete(projects).where(...).run()`.
 */
function createFakeDb(state: FakeDbState): HostServiceContext["db"] {
	return {
		insert: () => ({
			values: (row: { id: string }) => ({
				onConflictDoUpdate: () => ({
					run: () => {
						state.inserted.push(row);
					},
				}),
			}),
		}),
		delete: () => ({
			where: () => ({
				run: () => {
					state.deleted.push("projects");
				},
			}),
		}),
	} as unknown as HostServiceContext["db"];
}

function createCloudDownContext(state: FakeDbState): HostServiceContext {
	const cloudDown = () => {
		throw new Error("fetch failed");
	};
	return {
		organizationId: "org-1",
		db: createFakeDb(state),
		api: {
			v2Project: {
				create: { mutate: cloudDown },
				delete: { mutate: async () => undefined },
			},
			host: { ensure: { mutate: cloudDown } },
			v2Workspace: { create: { mutate: cloudDown } },
		},
		git: (repoPath: string) => simpleGit(repoPath),
	} as unknown as HostServiceContext;
}

let workRoot: string;

beforeEach(() => {
	workRoot = mkdtempSync(join(tmpdir(), "superset-handlers-"));
});

afterEach(() => {
	rmSync(workRoot, { recursive: true, force: true });
});

describe("project creation with cloud unreachable (#5183)", () => {
	test("importing an internal-repo folder fails when cloud is unreachable", async () => {
		// A local clone whose only remote is an internal GitHub host —
		// exactly the user's "create a new workspace by giving the git url".
		const repo = join(workRoot, "prod-issue-analysis");
		const git = await initRepoAt(repo);
		await git.addRemote(
			"origin",
			"git@github.com:xxx-internal/prod-issue-analysis.git",
		);

		const state: FakeDbState = { inserted: [], deleted: [] };
		const ctx = createCloudDownContext(state);

		// Bug: there is no way to import this folder while cloud is down.
		await expect(
			createFromImportLocal(ctx, {
				name: "prod-issue-analysis",
				repoPath: repo,
			}),
		).rejects.toThrow("fetch failed");

		// And the local project row that briefly existed is rolled back, so
		// the user is left with nothing — not even a local-only project.
		expect(state.inserted.length).toBe(1);
		expect(state.deleted).toContain("projects");
	});
});
