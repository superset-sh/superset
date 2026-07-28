import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";

type ProjectScenario = Awaited<ReturnType<typeof createProjectScenario>>;

/** Give the fixture repo a monorepo-ish shape to carve up. */
async function seedFolders(scenario: ProjectScenario): Promise<void> {
	const { repoPath, git } = scenario.repo;
	for (const dir of ["apps/desktop", "apps/web", "packages/ui"]) {
		mkdirSync(join(repoPath, dir), { recursive: true });
		writeFileSync(join(repoPath, dir, "file.txt"), dir);
	}
	writeFileSync(join(repoPath, "package.json"), "{}");
	await git.add(".");
	await git.commit("seed folders");
}

describe("project sparse checkout", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("setSparseCheckoutPaths persists, normalizes, and clears", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		const set = await scenario.host.trpc.project.setSparseCheckoutPaths.mutate({
			projectId: scenario.projectId,
			// Deliberately messy: duplicates, blanks, and decorated separators.
			paths: ["./apps/desktop/", "packages/ui", "", "  ", "apps/desktop"],
		});
		expect(set.sparseCheckoutPaths).toEqual(["apps/desktop", "packages/ui"]);

		let got = await scenario.host.trpc.project.get.query({
			projectId: scenario.projectId,
		});
		expect(got?.sparseCheckoutPaths).toEqual(["apps/desktop", "packages/ui"]);

		await scenario.host.trpc.project.setSparseCheckoutPaths.mutate({
			projectId: scenario.projectId,
			paths: [],
		});
		got = await scenario.host.trpc.project.get.query({
			projectId: scenario.projectId,
		});
		expect(got?.sparseCheckoutPaths).toEqual([]);
	});

	test("get defaults to an empty list for a project that never set it", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		const got = await scenario.host.trpc.project.get.query({
			projectId: scenario.projectId,
		});
		expect(got?.sparseCheckoutPaths).toEqual([]);
	});

	test("setSparseCheckoutPaths rejects traversal and a missing project", async () => {
		const scenario = await createProjectScenario();
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.project.setSparseCheckoutPaths.mutate({
				projectId: scenario.projectId,
				paths: ["../../etc"],
			}),
		).rejects.toBeInstanceOf(TRPCClientError);

		await expect(
			scenario.host.trpc.project.setSparseCheckoutPaths.mutate({
				projectId: randomUUID(),
				paths: ["apps/desktop"],
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("create() checks out only the configured folders, plus root files", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;
		await seedFolders(scenario);

		await scenario.host.trpc.project.setSparseCheckoutPaths.mutate({
			projectId: scenario.projectId,
			paths: ["apps/desktop"],
		});

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "sparse ws",
			branch: "feature/sparse",
		});

		const worktreePath = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result?.workspace?.id ?? ""))
			.get()?.worktreePath;
		expect(worktreePath).toBeTruthy();
		const at = (relative: string) =>
			existsSync(join(worktreePath ?? "", relative));

		// Cone mode always keeps the repo root, so root manifests survive.
		expect(at("package.json")).toBe(true);
		expect(at("apps/desktop/file.txt")).toBe(true);
		expect(at("apps/web")).toBe(false);
		expect(at("packages")).toBe(false);
	});

	test("create() checks out everything when no folders are configured", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;
		await seedFolders(scenario);

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "full ws",
			branch: "feature/full",
		});

		const worktreePath = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result?.workspace?.id ?? ""))
			.get()?.worktreePath;
		// Guard before using it: `join("", ...)` resolves against the process
		// CWD, which in this repo really does contain `apps/desktop` — so a
		// missing path would make every assertion below pass on a regression.
		expect(worktreePath).toBeTruthy();
		const at = (relative: string) =>
			existsSync(join(worktreePath ?? "", relative));

		expect(at("apps/desktop/file.txt")).toBe(true);
		expect(at("apps/web/file.txt")).toBe(true);
		expect(at("packages/ui/file.txt")).toBe(true);
	});
});
