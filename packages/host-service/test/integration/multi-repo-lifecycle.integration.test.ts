import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceRepos } from "../../src/db/schema";
import { shellSingleQuote } from "../../src/runtime/setup/config";
import {
	buildTeardownCommandFromShell,
	resolveWorkspaceTeardown,
} from "../../src/runtime/teardown/teardown";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { seedProject, seedWorkspace } from "../helpers/seed";

interface Scenario {
	host: TestHost;
	root: string;
	workspaceId: string;
	primaryProjectId: string;
	primaryWorktree: string;
	secondaryWorktree: string;
	dispose(): Promise<void>;
}

async function createScenario(options: {
	primaryTeardown?: string;
	secondaryTeardown?: string;
}): Promise<Scenario> {
	const host = await createTestHost();
	const root = mkdtempSync(join(tmpdir(), "multi-repo-lifecycle-"));
	const container = join(root, "container");

	const repos = ["town", "roster"].map((folder, position) => {
		const repoPath = join(root, folder);
		const worktreePath = join(container, folder);
		mkdirSync(join(repoPath, ".superset"), { recursive: true });
		mkdirSync(worktreePath, { recursive: true });
		const teardown =
			position === 0 ? options.primaryTeardown : options.secondaryTeardown;
		if (teardown) {
			writeFileSync(
				join(repoPath, ".superset", "config.json"),
				JSON.stringify({ teardown: [teardown] }),
			);
		}
		return {
			folder,
			position,
			repoPath,
			worktreePath,
			projectId: seedProject(host, { repoPath }).id,
		};
	});

	const primary = repos[0];
	if (!primary) throw new Error("scenario needs a primary repo");
	const { id: workspaceId } = seedWorkspace(host, {
		projectId: primary.projectId,
		worktreePath: primary.worktreePath,
		branch: "feature/lifecycle",
	});
	for (const repo of repos) {
		host.db
			.insert(workspaceRepos)
			.values({
				id: randomUUID(),
				workspaceId,
				position: repo.position,
				projectId: repo.projectId,
				folder: repo.folder,
				worktreePath: repo.worktreePath,
				branch: "feature/lifecycle",
			})
			.run();
	}

	return {
		host,
		root,
		workspaceId,
		primaryProjectId: primary.projectId,
		primaryWorktree: primary.worktreePath,
		secondaryWorktree: repos[1]?.worktreePath ?? "",
		dispose: async () => {
			await host.dispose();
			rmSync(root, { recursive: true, force: true });
		},
	};
}

let scenario: Scenario | null = null;

afterEach(async () => {
	await scenario?.dispose();
	scenario = null;
});

function teardownFor(current: Scenario, homeDir: string) {
	return resolveWorkspaceTeardown({
		db: current.host.db,
		workspaceId: current.workspaceId,
		projectId: current.primaryProjectId,
		repoPath: join(current.root, "town"),
		worktreePath: current.primaryWorktree,
		homeDir,
	});
}

describe("teardown across a project's source folders", () => {
	test("runs each folder's command, in folder order, from its own checkout", async () => {
		scenario = await createScenario({
			primaryTeardown: "stop-town",
			secondaryTeardown: "stop-roster",
		});
		const homeDir = mkdtempSync(join(tmpdir(), "multi-repo-home-"));

		const resolved = teardownFor(scenario, homeDir);

		expect(resolved?.initialCommand).toBe(
			buildTeardownCommandFromShell(
				`cd ${shellSingleQuote(scenario.primaryWorktree)} && stop-town && cd ${shellSingleQuote(scenario.secondaryWorktree)} && stop-roster`,
			),
		);
		rmSync(homeDir, { recursive: true, force: true });
	});

	test("runs a folder that defines one even when the primary does not", async () => {
		scenario = await createScenario({ secondaryTeardown: "stop-roster" });
		const homeDir = mkdtempSync(join(tmpdir(), "multi-repo-home-"));

		const resolved = teardownFor(scenario, homeDir);

		expect(resolved?.initialCommand).toBe(
			buildTeardownCommandFromShell(
				`cd ${shellSingleQuote(scenario.secondaryWorktree)} && stop-roster`,
			),
		);
		rmSync(homeDir, { recursive: true, force: true });
	});

	test("is exactly the single-repo command when only the primary defines one", async () => {
		scenario = await createScenario({ primaryTeardown: "stop-town" });
		const homeDir = mkdtempSync(join(tmpdir(), "multi-repo-home-"));

		const resolved = teardownFor(scenario, homeDir);

		expect(resolved?.initialCommand).toBe("exec bash -c 'stop-town'");
		rmSync(homeDir, { recursive: true, force: true });
	});

	test("skips when no folder defines one", async () => {
		scenario = await createScenario({});
		const homeDir = mkdtempSync(join(tmpdir(), "multi-repo-home-"));

		expect(teardownFor(scenario, homeDir)).toBeNull();
		rmSync(homeDir, { recursive: true, force: true });
	});
});
