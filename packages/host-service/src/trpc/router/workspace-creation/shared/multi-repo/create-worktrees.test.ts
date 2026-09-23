import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUserSimpleGit } from "../../../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../../../types";
import { createMultiRepoWorktrees } from "./create-worktrees";
import type { ResolvedFolder } from "./resolve-folders";

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-hs-multi-repo-${process.pid}`,
);

function createTestRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	execSync("git init -b main", { cwd: repoPath, stdio: "ignore" });
	execSync("git config user.email 'test@test.com'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	execSync("git config user.name 'Test'", { cwd: repoPath, stdio: "ignore" });
	execSync("git commit --allow-empty -m init", {
		cwd: repoPath,
		stdio: "ignore",
	});
	return repoPath;
}

/** Records every argv git is handed, so a test can assert what never reaches it. */
const gitArgs: string[][] = [];

function recordingCtx(): HostServiceContext {
	return {
		credentials: {
			getCredentials: async () => ({ env: {} }),
			getToken: async () => null,
			credentialRemedy: () => "",
		},
		git: async (repoPath: string) => {
			const client = createUserSimpleGit(repoPath);
			return new Proxy(client, {
				get(target, property, receiver) {
					const value = Reflect.get(target, property, receiver);
					if (typeof value !== "function") return value;
					return (...args: unknown[]) => {
						gitArgs.push([
							String(property),
							...args.flatMap((arg) =>
								Array.isArray(arg) ? arg.map(String) : [String(arg)],
							),
						]);
						return (value as (...a: unknown[]) => unknown).apply(target, args);
					};
				},
			});
		},
	} as unknown as HostServiceContext;
}

function folder(
	position: number,
	name: string,
	repoPath: string,
): ResolvedFolder {
	return {
		position,
		folder: name,
		projectId: `project-${name}`,
		repoPath,
		baseBranch: null,
		sparsePaths: [],
	};
}

async function planFor(
	repoPath: string,
	branch: string,
): Promise<Parameters<typeof createMultiRepoWorktrees>[0]["primaryPlan"]> {
	const head = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoPath })
		.toString()
		.trim();
	return {
		branch,
		startPoint: { kind: "local", shortName: head },
		usedExistingBranch: false,
	} as Parameters<typeof createMultiRepoWorktrees>[0]["primaryPlan"];
}

describe("createMultiRepoWorktrees", () => {
	beforeEach(() => {
		gitArgs.length = 0;
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR))
			rmSync(TEST_DIR, { recursive: true, force: true });
	});

	test("keeps the same branch name in every repo where it is free", async () => {
		const api = createTestRepo("free-api");
		const web = createTestRepo("free-web");
		const container = join(TEST_DIR, "free-container");

		const repos = await createMultiRepoWorktrees({
			ctx: recordingCtx(),
			containerPath: container,
			folders: [folder(0, "api", api), folder(1, "web", web)],
			primaryPlan: await planFor(api, "feature/shared"),
			baseBranch: undefined,
			onProgress: () => {},
		});

		expect(repos.map((repo) => repo.branch)).toEqual([
			"feature/shared",
			"feature/shared",
		]);
		expect(repos.map((repo) => repo.worktreePath)).toEqual([
			join(container, "api"),
			join(container, "web"),
		]);
	});

	test("bumps only the repo where the branch is already taken", async () => {
		const api = createTestRepo("taken-api");
		const web = createTestRepo("taken-web");
		execSync("git branch feature/shared", { cwd: web, stdio: "ignore" });
		const container = join(TEST_DIR, "taken-container");

		const repos = await createMultiRepoWorktrees({
			ctx: recordingCtx(),
			containerPath: container,
			folders: [folder(0, "api", api), folder(1, "web", web)],
			primaryPlan: await planFor(api, "feature/shared"),
			baseBranch: undefined,
			onProgress: () => {},
		});

		expect(repos.map((repo) => repo.branch)).toEqual([
			"feature/shared",
			"feature/shared-2",
		]);
	});

	test("the container path is never handed to git", async () => {
		const api = createTestRepo("invariant-api");
		const web = createTestRepo("invariant-web");
		const container = join(TEST_DIR, "invariant-container");

		await createMultiRepoWorktrees({
			ctx: recordingCtx(),
			containerPath: container,
			folders: [folder(0, "api", api), folder(1, "web", web)],
			primaryPlan: await planFor(api, "feature/invariant"),
			baseBranch: undefined,
			onProgress: () => {},
		});

		const everyArg = gitArgs.flat();
		expect(everyArg).not.toContain(container);
		expect(everyArg).toContain(join(container, "api"));

		for (const repoPath of [api, web]) {
			const list = execSync("git worktree list --porcelain", {
				cwd: repoPath,
			}).toString();
			expect(list).not.toContain(`worktree ${container}\n`);
		}
	});

	test("a failing folder rolls back every worktree, branch and the container", async () => {
		const api = createTestRepo("rollback-api");
		const broken = join(TEST_DIR, "rollback-broken");
		mkdirSync(broken, { recursive: true });
		const container = join(TEST_DIR, "rollback-container");

		await expect(
			createMultiRepoWorktrees({
				ctx: recordingCtx(),
				containerPath: container,
				folders: [folder(0, "api", api), folder(1, "broken", broken)],
				primaryPlan: await planFor(api, "feature/rollback"),
				baseBranch: undefined,
				onProgress: () => {},
			}),
		).rejects.toThrow(/folder "broken"/);

		expect(existsSync(container)).toBe(false);
		const list = execSync("git worktree list --porcelain", {
			cwd: api,
		}).toString();
		expect(list).not.toContain(container);
		const branches = execSync("git branch --list", { cwd: api }).toString();
		expect(branches).not.toContain("feature/rollback");
	});
});
