import { beforeEach, expect, mock, test } from "bun:test";
import { spawnSync as runIsolatedTest } from "node:child_process";
import { mkdtempSync as makeTestCwd, rmSync as removeTestCwd } from "node:fs";
import type { HostServiceContext } from "../../../types";
import type { GitClient } from "../workspace-creation/shared/types";
import type { GitlabCheckout } from "./create-gitlab-checkout";

if (process.env.SUPERSET_HOST_GITLAB_MOCK_FIXTURE !== "create-checkout") {
	test("create-checkout runs with isolated owned module boundaries", () => {
		const cwd = makeTestCwd("/tmp/superset-host-create-checkout-");
		try {
			const child = runIsolatedTest(
				process.execPath,
				["test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						GIT_CONFIG_GLOBAL: "/dev/null",
						GIT_CONFIG_NOSYSTEM: "1",
						GIT_TERMINAL_PROMPT: "0",
						SUPERSET_HOST_GITLAB_MOCK_FIXTURE: "create-checkout",
					},
					stdio: "pipe",
					timeout: 60000,
				},
			);
			if (child.stdout) process.stdout.write(child.stdout);
			if (child.stderr) process.stderr.write(child.stderr);
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			removeTestCwd(cwd, { recursive: true, force: true });
		}
	}, 65000);
} else {
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("Unexpected outbound transport in owned GitLab test");
		},
		{ preconnect: () => {} },
	);
	const { refreshGitlabWorkspace, resolveGitlabCheckout } = await import(
		"./create-gitlab-checkout"
	);
	const host = "gl.example.test:8443",
		target = `https://${host}/Team/Widget.git`,
		sha = "a".repeat(40);
	const metadata = {
		provider: "gitlab" as const,
		host,
		number: 12,
		headRefName: "Feature",
		headRefOid: sha,
		headRepositoryOwner: "Team",
		headRepositoryName: "Widget",
		headRepositoryUrl: target,
		isCrossRepository: false,
		selectedRepositoryUrl: target,
		selectedRemoteName: "gitlab",
		selectedOrganizationId: "org",
		projectId: "7",
		sourceProjectId: "7",
		targetProjectId: "7",
		url: `https://${host}/Team/Widget/-/merge_requests/12`,
		title: "Feature",
		baseRefName: "main",
		state: "open" as const,
	};
	const checkout: GitlabCheckout = {
		localProjectId: "project",
		projectSelection: { repoPath: "/virtual/project", remoteName: "gitlab" },
		organizationId: "org",
		repo: {
			provider: "gitlab",
			host,
			owner: "Team",
			name: "Widget",
			url: target.slice(0, -4),
			repoPath: "/virtual/project",
			remoteName: "gitlab",
		},
		metadata,
	};
	const projectHelpers = await import(
		"../workspace-creation/shared/project-helpers"
	);
	let provenAbsence = false,
		inspectionMutation: (() => void) | undefined,
		inspectionError: Error | undefined;
	const fixtureModule0 = {
		...projectHelpers,
		resolveRepo: async (ctx: HostServiceContext) => {
			if (provenAbsence) {
				inspectionMutation?.();
				if (inspectionError) throw inspectionError;
				return null;
			}
			const project = ctx.db.query.projects.findFirst().sync();
			if (!project?.repoUrl) throw Error("FIXTURE_MISSING_PROJECT");
			return {
				provider: project.repoProvider,
				host: new URL(project.repoUrl).host,
				owner: project.repoOwner,
				name: project.repoName,
				repoPath: project.repoPath,
				remoteName: project.remoteName,
				url: project.repoUrl,
			};
		},
	};
	mock.module(
		"../workspace-creation/shared/project-helpers",
		() => fixtureModule0,
	);
	const importedModule0 = await import(
		"../workspace-creation/shared/project-helpers"
	);
	for (const [name, value] of Object.entries(fixtureModule0))
		expect(Reflect.get(importedModule0, name)).toBe(value);
	const initialProject = {
		id: "project",
		name: "Project",
		repoPath: checkout.projectSelection.repoPath,
		remoteName: checkout.projectSelection.remoteName,
		repoProvider: checkout.repo.provider,
		repoOwner: checkout.repo.owner,
		repoName: checkout.repo.name,
		repoUrl: checkout.repo.url,
	};
	let currentProject = { ...initialProject };
	const workspace = {
		projectId: "project",
		branch: "Feature",
		worktreePath: "/virtual/worktree",
		pullRequestId: "linked",
	};
	const link = {
		projectId: "project",
		repoProvider: "gitlab",
		repoHost: host,
		repoOwner: "Team",
		repoName: "Widget",
		prNumber: 12,
	};
	let gitRoot = "/virtual/project";
	let currentLink: typeof link | null = link,
		marker = "",
		localHead = sha,
		dirty = "",
		divergent = false,
		foreignCommon = false;
	const calls: string[][] = [];
	const credentials = mock(async () => ({ env: { GIT_TERMINAL_PROMPT: "0" } }));
	const git = {
		env: () => git,
		raw: async (args: string[]) => {
			calls.push(args);
			if (args.includes("--show-toplevel")) return gitRoot;
			if (args.includes("--git-common-dir"))
				return foreignCommon && args[0] === "-C"
					? "/other/.git"
					: "/virtual/project/.git";
			if (args[0] === "config" && args.includes("--get"))
				return args.at(-1) === "remote.gitlab.url" ? target : marker;
			if (args[0] === "remote") return target;
			if (args.includes("symbolic-ref")) return "Feature";
			if (args.includes("status")) return dirty;
			if (args[0] === "merge-base" && divergent) throw Error("FAKE_DIVERGENCE");
			if (args[0] === "-C" && args.includes("merge")) localHead = sha;
			if (args[0] === "rev-parse")
				return args[2]?.startsWith("refs/heads/") ? localHead : sha;
			return "";
		},
	} as unknown as GitClient;
	const ctx = {
		isAuthenticated: true,
		organizationId: "org",
		credentials: { getCredentials: credentials },
		db: {
			query: {
				projects: {
					findFirst: () => ({ sync: () => ({ ...currentProject }) }),
				},
			},
			select: () => ({
				from: () => ({ where: () => ({ get: () => currentLink }) }),
			}),
		},
	} as unknown as HostServiceContext;
	beforeEach(() => {
		provenAbsence = false;
		inspectionMutation = undefined;
		inspectionError = undefined;
		currentProject = { ...initialProject };
		gitRoot = "/virtual/project";
		currentLink = link;
		marker = "";
		localHead = sha;
		dirty = "";
		divergent = false;
		foreignCommon = false;
		ctx.organizationId = "org";
		calls.length = 0;
		credentials.mockClear();
	});
	for (const mode of [
		"fresh",
		"known-gl",
		"marker-during-inspection",
		"marker-cleared-during-inspection",
		"root-during-inspection",
		"remote-during-inspection",
		"current-gl-link",
		"missing-link",
		"foreign-link",
		"unknown-link",
		"current-gh-link",
		"getter-refusal",
		"inspection-error",
	] as const)
		test(`typed absence checkout selection ${mode}`, async () => {
			provenAbsence = true;
			currentProject = { ...initialProject, repoProvider: "github" };
			let getterReads = 0;
			const getter = () => {
				getterReads++;
				if (mode === "getter-refusal")
					throw Error("OWNED_CURRENT_WORKSPACE_REPLACED");
				return "linked";
			};
			if (mode === "known-gl") currentProject.repoProvider = "gitlab";
			if (mode === "marker-cleared-during-inspection") {
				currentProject.repoProvider = "gitlab";
				inspectionMutation = () => {
					currentProject.repoProvider = "github";
				};
			}
			if (mode === "marker-during-inspection")
				inspectionMutation = () => {
					currentProject.repoProvider = "gitlab";
				};
			if (mode === "root-during-inspection")
				inspectionMutation = () => {
					currentProject.repoPath = "/other/root";
				};
			if (mode === "remote-during-inspection")
				inspectionMutation = () => {
					currentProject.remoteName = "other";
				};
			if (mode === "missing-link") currentLink = null;
			if (mode === "foreign-link")
				currentLink = { ...link, projectId: "foreign" };
			if (mode === "unknown-link")
				currentLink = { ...link, repoProvider: "unknown" };
			if (mode === "current-gh-link")
				currentLink = { ...link, repoProvider: "github" };
			if (mode === "inspection-error")
				inspectionError = Error("OWNED_REMOTE_INSPECTION_FAILED");
			const outcome = resolveGitlabCheckout(
				ctx,
				"project",
				12,
				[
					"current-gl-link",
					"missing-link",
					"foreign-link",
					"unknown-link",
					"current-gh-link",
					"getter-refusal",
				].includes(mode)
					? getter
					: undefined,
			);
			if (mode === "fresh" || mode === "current-gh-link")
				expect(await outcome).toBeNull();
			else if (mode === "inspection-error")
				await expect(outcome).rejects.toThrow("OWNED_REMOTE_INSPECTION_FAILED");
			else await expect(outcome).rejects.toMatchObject({ code: "CONFLICT" });
			if (mode === "current-gh-link") expect(getterReads).toBe(1);
			expect(credentials).not.toHaveBeenCalled();
			expect(calls).toEqual([]);
		});
	function refresh() {
		return refreshGitlabWorkspace(ctx, git, checkout, workspace, "project");
	}
	test("recorded SQLite PR identity conflicts reject before credentials or fetch", async () => {
		for (const changed of [
			{ ...link, repoHost: "other.test" },
			{ ...link, repoOwner: "team" },
			{ ...link, repoName: "Other" },
			{ ...link, repoProvider: "github" },
			{ ...link, prNumber: 13 },
			null,
		]) {
			currentLink = changed;
			await expect(refresh()).rejects.toMatchObject({ code: "CONFLICT" });
		}
		expect(credentials).not.toHaveBeenCalled();
		expect(calls.some((args) => args.includes("fetch"))).toBe(false);
	});
	test("verified legacy link accepts exact current head and writes current authority marker", async () => {
		await refresh();
		expect(credentials).toHaveBeenCalledWith(target);
		expect(calls).toContainEqual([
			"config",
			"branch.Feature.supersetGitlabCheckout",
			JSON.stringify(["org", target, "7", 12]),
		]);
	});
	test("dirty, divergent, unrelated worktree and changed organization cannot refresh", async () => {
		localHead = "b".repeat(40);
		dirty = "?? local.txt";
		await expect(refresh()).rejects.toMatchObject({ code: "CONFLICT" });
		expect(calls.some((args) => args.includes("merge"))).toBe(false);
		dirty = "";
		divergent = true;
		await expect(refresh()).rejects.toMatchObject({ code: "CONFLICT" });
		expect(calls.some((args) => args.includes("merge"))).toBe(false);
		foreignCommon = true;
		credentials.mockClear();
		await expect(refresh()).rejects.toMatchObject({ code: "CONFLICT" });
		expect(credentials).not.toHaveBeenCalled();
		foreignCommon = false;
		ctx.organizationId = "other";
		await expect(refresh()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
	test("unmarked generic workspaces are never advanced using guessed MR ancestry", async () => {
		localHead = "b".repeat(40);
		await expect(
			refreshGitlabWorkspace(
				ctx,
				git,
				checkout,
				{ ...workspace, pullRequestId: null },
				"project",
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(calls.some((args) => args.includes("merge"))).toBe(false);
		localHead = sha;
		await refreshGitlabWorkspace(
			ctx,
			git,
			checkout,
			{ ...workspace, pullRequestId: null },
			"project",
		);
	});
	test("proven old checkout fast-forwards while exact current head keeps local changes", async () => {
		localHead = "b".repeat(40);
		await refresh();
		expect(localHead).toBe(sha);
		expect(calls.some((args) => args.includes("--ff-only"))).toBe(true);
		dirty = "?? local.txt";
		calls.length = 0;
		await refresh();
		expect(calls.some((args) => args.includes("merge"))).toBe(false);
	});

	test("a Git client rooted in a repointed local project refuses credential materialization", async () => {
		gitRoot = "/other/project";
		await expect(refresh()).rejects.toMatchObject({ code: "CONFLICT" });
		expect(credentials).not.toHaveBeenCalled();
		expect(calls.some((args) => args.includes("fetch"))).toBe(false);
	});

	test("fresh selected provider, root, remote, exact host and namespace precede native credentials", async () => {
		for (const changed of [
			{ repoPath: "/other/project" },
			{ remoteName: "other" },
			{ repoProvider: "github" as const },
			{ repoUrl: "https://other.test/Team/Widget" },
			{ repoOwner: "team" },
			{ repoName: "Other" },
		]) {
			currentProject = { ...initialProject, ...changed };
			await expect(refresh()).rejects.toMatchObject({ code: "CONFLICT" });
		}
		expect(credentials).not.toHaveBeenCalled();
		expect(calls.some((args) => args.includes("fetch"))).toBe(false);
	});
}
