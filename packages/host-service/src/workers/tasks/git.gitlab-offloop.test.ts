import { expect, mock, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
} from "node:fs";

if (process.env.SUPERSET_GITLAB_OFFLOOP_FIXTURE !== "pool-safety") {
	test("GitLab pool mutation safety runs in an isolated child", () => {
		const cwd = mkdtempSync("/tmp/superset-gitlab-offloop-pure-");
		try {
			const child = spawnSync(
				process.execPath,
				["test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_GITLAB_OFFLOOP_FIXTURE: "pool-safety",
					},
					stdio: "pipe",
					timeout: 15_000,
				},
			);
			if (child.stdout) process.stdout.write(child.stdout);
			if (child.stderr) process.stderr.write(child.stderr);
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
	test.skipIf(process.env.SUPERSET_GITLAB_OFFLOOP_NATIVE_TEST !== "1")(
		"production Git worker uses physical storage and quarantines uncertain admission",
		async () => {
			const { linguiMacroPlugin } = await import("@superset/i18n/bun-plugin");
			const { join } = await import("node:path");
			const { writeFileSync, readFileSync, existsSync } = await import(
				"node:fs"
			);
			const temp = mkdtempSync("/tmp/superset-gitlab-worker-native-");
			try {
				const guard = join(temp, "deny.cjs");
				writeFileSync(guard, nativeDenialPreload);
				const buildScript = `import {linguiMacroPlugin} from ${JSON.stringify(Bun.resolveSync("@superset/i18n/bun-plugin", import.meta.dir))}; const result=await Bun.build({entrypoints:[${JSON.stringify(new URL("../host-worker.ts", import.meta.url).pathname)}],plugins:[linguiMacroPlugin],target:"node",format:"esm",outdir:${JSON.stringify(temp)},naming:"host-worker.js",define:{"process.env.NODE_ENV":JSON.stringify("production")}}); if(!result.success)throw new AggregateError(result.logs,"Owned production worker build failed");`;
				const builder = spawnSync(
					process.execPath,
					["--no-env-file", "-e", buildScript],
					{
						cwd: temp,
						env: { PATH: process.env.PATH, TMPDIR: "/tmp", HOME: temp },
						stdio: "pipe",
						timeout: 15000,
					},
				);
				if (builder.error) throw builder.error;
				if (builder.status !== 0)
					throw new Error(
						`Owned production worker builder failed: ${builder.stderr.toString()}`,
					);
				const entry = `${nativeWorkerProof.toString()}\nawait nativeWorkerProof();`;
				const built = await Bun.build({
					entrypoints: [import.meta.path],
					target: "node",
					format: "esm",
					plugins: [
						{
							name: "owned-native-entry",
							setup(build) {
								build.onLoad(
									{ filter: /git\.gitlab-offloop\.test\.ts$/ },
									() => ({ contents: entry, loader: "ts" }),
								);
							},
						},
						linguiMacroPlugin,
					],
				});
				if (!built.success)
					throw new AggregateError(
						built.logs,
						"Owned production worker assertion bundle failed",
					);
				const output = built.outputs[0];
				if (!output) throw new Error("Missing owned worker assertion bundle");
				const bundle = join(temp, "proof.mjs");
				await Bun.write(bundle, output);
				const runtime = process.env.SUPERSET_GITLAB_CHECKOUT_NODE;
				if (!runtime)
					throw new Error("Explicit owned Node runtime is required");
				const child = spawnSync(runtime, ["--require", guard, bundle, temp], {
					cwd: temp,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						HOME: temp,
						ELECTRON_RUN_AS_NODE: "1",
						GIT_CONFIG_GLOBAL: "/dev/null",
						GIT_CONFIG_NOSYSTEM: "1",
						GIT_TERMINAL_PROMPT: "0",
						SUPERSET_OWNED_PRELOAD_LOG: join(temp, "preload.log"),
					},
					stdio: "pipe",
					timeout: 30000,
				});
				if (child.stdout) process.stdout.write(child.stdout);
				if (child.stderr) process.stderr.write(child.stderr);
				if (child.error) throw child.error;
				expect(child.status).toBe(0);
				expect(child.stdout.toString()).toContain(
					'"proof":"production-worker"',
				);
				expect(readFileSync(join(temp, "preload.log"), "utf8")).toContain(
					"worker:",
				);
			} finally {
				rmSync(temp, { recursive: true, force: true });
				expect(existsSync(temp)).toBe(false);
			}
		},
		45000,
	);
} else {
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("Unexpected network in off-loop pool safety fixture");
		},
		{ preconnect: () => {} },
	);
	let execute: (
		argv: string[],
		cwd?: string,
		env?: Record<string, string>,
	) => Promise<string>;
	const fixtureModule = {
		createUserSimpleGit: (
			cwd?: string,
			options?: { env?: Record<string, string> },
		) => {
			let env: Record<string, string> = options?.env ?? {};
			const git = {
				raw: (argv: string[]) => execute(argv, cwd, env),
				revparse: (argv: string[]) => execute(["rev-parse", ...argv], cwd, env),
				env: (value: Record<string, string>) => {
					env = value;
					return git;
				},
			};
			return git;
		},
	};
	mock.module("../../runtime/git/simple-git", () => fixtureModule);
	const simpleGitModule = await import("../../runtime/git/simple-git");
	expect(
		Object.is(
			simpleGitModule.createUserSimpleGit,
			fixtureModule.createUserSimpleGit,
		),
	).toBe(true);
	const { HostWorkerPool } = await import("../host-worker-pool");
	const { defineWorkerTask } = await import("../define-worker-task");
	const {
		WorkerTaskError,
		WorkerTaskIndeterminateError,
		WORKER_CRASH_ERROR_NAME,
	} = await import("../WorkerTaskRunner");
	const { materializePrBranch } = await import(
		"../../trpc/router/workspace-creation/utils/pr-branch-materialize"
	);
	const { addWorktreeWithSparseCheckout } = await import(
		"../../trpc/router/workspace-creation/shared/sparse-checkout"
	);
	const { gitGitlabRawTask } = await import("./git");
	const { gitConfirmNoPlatformRemotesTask } = await import("./git");
	for (const mode of [
		"empty",
		"local",
		"github",
		"gitlab",
		"unknown",
		"missing-sentinel",
		"truncated",
		"malformed",
		"command-error",
	] as const) {
		test(`complete remote inspection distinguishes ${mode}`, async () => {
			let configQueries = 0;
			execute = async (argv, cwd) => {
				if (argv[0] === "rev-parse") return "/owned/root\n";
				expect(cwd).toBe("/owned/root");
				expect(argv.slice(2)).toEqual([
					"config",
					"--null",
					"--get-regexp",
					String.raw`^remote\..*\.url$`,
				]);
				configQueries++;
				if (mode === "command-error")
					throw new Error("OWNED_CONFIG_PERMISSION_ERROR");
				const sentinel = argv[1];
				if (!sentinel) throw Error("Missing owned sentinel");
				const equals = sentinel.indexOf("=");
				const key = sentinel.slice(0, equals),
					value = sentinel.slice(equals + 1);
				if (mode === "missing-sentinel") return "";
				if (mode === "truncated") return `${key}\n${value}`;
				if (mode === "malformed") return `${key}\n${value}\0broken-record\0`;
				const url =
					mode === "local"
						? "/owned/bare.git"
						: mode === "github"
							? "https://github.com/Team/Case.git"
							: mode === "gitlab"
								? "https://gitlab.com/Team/Case.git"
								: mode === "unknown"
									? "https://unknown.example.test/Team/Case.git"
									: null;
				return `${key}\n${value}\0${url ? `remote.origin.url\n${url}\0` : ""}`;
			};
			const outcome = gitConfirmNoPlatformRemotesTask.handler({
				repoPath: "/owned/root",
			});
			if (["empty", "local", "github", "gitlab", "unknown"].includes(mode))
				expect(await outcome).toEqual({
					repoPath: "/owned/root",
					noPlatformRemote: mode === "empty" || mode === "local",
				});
			else
				await expect(outcome).rejects.toThrow(
					mode === "command-error"
						? "OWNED_CONFIG_PERMISSION_ERROR"
						: undefined,
				);
			expect(configQueries).toBe(1);
		});
	}
	const poolExports = await import("../host-worker-pool");
	let initialInspection: {
		repoPath: string;
		remotes: Array<
			[
				string,
				{
					provider: "github";
					host: string;
					owner: string;
					name: string;
					url: string;
				},
			]
		>;
	} = { repoPath: "/owned/root", remotes: [] };
	let confirmation: { repoPath: string; noPlatformRemote: boolean } = {
		repoPath: "/owned/root",
		noPlatformRemote: true,
	};
	let proofError: Error | undefined,
		inspectionTaskNames: string[] = [];
	const resolverPoolOwner = {
		...poolExports,
		getHostWorkerPool: () => ({
			run: async (task: { type: string }) => {
				inspectionTaskNames.push(task.type);
				if (task.type === "git/resolveRepository") return initialInspection;
				if (proofError) throw proofError;
				return confirmation;
			},
		}),
	};
	mock.module("../host-worker-pool", () => resolverPoolOwner);
	expect(
		Object.is(
			(await import("../host-worker-pool")).getHostWorkerPool,
			resolverPoolOwner.getHostWorkerPool,
		),
	).toBe(true);
	const { resolveRepo } = await import(
		"../../trpc/router/workspace-creation/shared/project-helpers"
	);
	const resolverCtx = {
		db: {
			query: {
				projects: {
					findFirst: () => ({
						sync: () => ({
							id: "project",
							repoPath: "/owned/root",
							remoteName: "origin",
							repoProvider: null,
							repoUrl: null,
						}),
					}),
				},
			},
		},
		credentials: {
			getToken: async () => {
				throw Error("Unexpected token lookup");
			},
		},
	} as unknown as Parameters<typeof resolveRepo>[0];
	for (const mode of [
		"strict-default",
		"proven-empty",
		"inspection-error",
		"new-platform",
		"changed-root",
		"parsed-github",
	] as const)
		test(`opt-in resolver absence ${mode}`, async () => {
			initialInspection = { repoPath: "/owned/root", remotes: [] };
			confirmation = { repoPath: "/owned/root", noPlatformRemote: true };
			proofError = undefined;
			inspectionTaskNames = [];
			if (mode === "inspection-error")
				proofError = Error("OWNED_CONFIG_FAILED");
			if (mode === "new-platform") confirmation.noPlatformRemote = false;
			if (mode === "changed-root") confirmation.repoPath = "/other/root";
			if (mode === "parsed-github")
				initialInspection.remotes = [
					[
						"origin",
						{
							provider: "github",
							host: "github.com",
							owner: "Team",
							name: "Case",
							url: "https://github.com/Team/Case",
						},
					],
				];
			const outcome =
				mode === "strict-default"
					? resolveRepo(resolverCtx, "project")
					: resolveRepo(resolverCtx, "project", {
							allowNoPlatformRemote: true,
						});
			if (mode === "proven-empty") expect(await outcome).toBeNull();
			else if (mode === "parsed-github")
				expect(await outcome).toMatchObject({
					provider: "github",
					host: "github.com",
				});
			else await expect(outcome).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(inspectionTaskNames).toEqual(
				mode === "strict-default" || mode === "parsed-github"
					? ["git/resolveRepository"]
					: ["git/resolveRepository", "git/confirmNoPlatformRemotes"],
			);
		});
	const { join, relative } = await import("node:path");
	for (const mode of [
		"plain",
		"linked",
		"foreign",
		"chained-foreign",
		"subdirectory",
		"empty",
		"symlink-parent",
		"single-symlink-parent",
		"single-symlink-linked",
		"foreign-root-metadata",
		"core-worktree-config",
		"missing",
		"malformed",
		"malformed-c",
		"empty-c",
		"missing-command",
		"unsupported",
		"bound-env",
	] as const)
		test(`raw task verifies effective physical command target: ${mode}`, async () => {
			const owned = realpathSync(mkdtempSync("/tmp/superset-offloop-target-"));
			try {
				const base = join(owned, "base"),
					linked = join(owned, "nested", "linked"),
					foreign = join(owned, "nested", "foreign"),
					common = join(owned, "common"),
					foreignCommon = join(owned, "foreign-common"),
					alias = join(owned, "alias");
				for (const path of [
					base,
					linked,
					foreign,
					common,
					foreignCommon,
					join(linked, "sub"),
				])
					mkdirSync(path, { recursive: true });
				symlinkSync(linked, alias, "dir");
				mkdirSync(join(foreign, "sub"));
				symlinkSync(join(foreign, "sub"), join(base, "foreign-link"), "dir");
				symlinkSync(join(linked, "sub"), join(base, "linked-link"), "dir");
				const info = statSync(common),
					storage = {
						commonDir: realpathSync(common),
						device: info.dev,
						inode: info.ino,
					};
				const probes: Array<{ args: string[]; env: Record<string, string> }> =
						[],
					writes: string[] = [];
				execute = async (args, cwd, env = {}) => {
					let target = cwd ?? base,
						index = 0,
						configuredRoot: string | undefined;
					while (args[index] === "-C" || args[index] === "-c") {
						if (args[index] === "-C" && args[index + 1]) {
							const operand = args[index + 1];
							if (typeof operand !== "string")
								throw new Error("Malformed owned prefix");
							if (operand.startsWith("/")) target = "/";
							for (const part of operand.split("/")) {
								if (part && part !== ".")
									target = realpathSync(`${target}/${part}`);
							}
						}
						if (
							mode === "foreign-root-metadata" &&
							args[index] === "-c" &&
							args[index + 1]?.startsWith("core.worktree=")
						)
							configuredRoot = args[index + 1]?.slice("core.worktree=".length);
						index += 2;
					}
					const targetRoot = [base, linked, foreign].find(
						(root) =>
							target === root || !relative(root, target).startsWith(".."),
					);
					if (!targetRoot) throw new Error("Unowned effective fixture root");
					if (args[index] === "rev-parse") {
						probes.push({ args: [...args], env: { ...env } });
						if (args[index + 1] === "--show-toplevel")
							return `${configuredRoot ?? targetRoot}\n`;
						if (args[index + 1] === "--git-common-dir")
							return `${targetRoot === foreign ? foreignCommon : common}\n`;
					}
					if (args[index] === "config") {
						writes.push(targetRoot);
						return "OWNED_CONFIG_WRITE";
					}
					throw new Error("Unowned effective fixture command");
				};
				let argv = ["-C", linked, "config", "branch.owned.base", "main"];
				if (mode === "plain") argv = ["config", "branch.owned.base", "main"];
				if (mode === "foreign")
					argv = ["-C", foreign, "config", "branch.owned.base", "main"];
				if (mode === "chained-foreign")
					argv = [
						"-C",
						linked,
						"-C",
						"../foreign",
						"config",
						"branch.owned.base",
						"main",
					];
				if (mode === "subdirectory")
					argv = [
						"-C",
						join(linked, "sub"),
						"config",
						"branch.owned.base",
						"main",
					];
				if (mode === "empty")
					argv = ["-C", "", "config", "branch.owned.base", "main"];
				if (mode === "symlink-parent")
					argv = [
						"-C",
						alias,
						"-C",
						"../foreign",
						"config",
						"branch.owned.base",
						"main",
					];
				if (mode === "single-symlink-linked")
					argv = [
						"-C",
						"linked-link/..",
						"config",
						"branch.owned.base",
						"main",
					];
				if (mode === "single-symlink-parent")
					argv = [
						"-C",
						"foreign-link/..",
						"config",
						"branch.owned.base",
						"main",
					];
				if (mode === "foreign-root-metadata" || mode === "core-worktree-config")
					argv = [
						"-c",
						`core.worktree=${foreign}`,
						"config",
						"branch.owned.base",
						"main",
					];
				if (mode === "missing")
					argv = [
						"-C",
						join(owned, "missing"),
						"config",
						"branch.owned.base",
						"main",
					];
				if (mode === "malformed") argv = ["-C"];
				if (mode === "malformed-c") argv = ["-c"];
				if (mode === "empty-c")
					argv = ["-c", "", "config", "branch.owned.base", "main"];
				if (mode === "missing-command") argv = ["-C", linked];
				if (mode === "unsupported")
					argv = [
						`--git-dir=${foreignCommon}`,
						"config",
						"branch.owned.base",
						"main",
					];
				if (mode === "bound-env")
					argv = [
						"-c",
						"http.followRedirects=false",
						"-C",
						linked,
						"config",
						"branch.owned.base",
						"main",
					];
				const outcome = gitGitlabRawTask.handler({
					repoPath: base,
					storage,
					argv,
					gitEnv: { OWNED_FIXTURE_TOKEN: "exact-host" },
				});
				if (
					[
						"plain",
						"linked",
						"subdirectory",
						"empty",
						"bound-env",
						"single-symlink-linked",
						"core-worktree-config",
					].includes(mode)
				) {
					expect(await outcome).toBe("OWNED_CONFIG_WRITE");
					expect(writes).toEqual([
						mode === "empty" ||
						mode === "plain" ||
						mode === "core-worktree-config"
							? base
							: linked,
					]);
					const prefix = argv.slice(0, argv.indexOf("config"));
					expect(
						probes.some(
							(probe) =>
								JSON.stringify(probe.args) ===
									JSON.stringify([
										...prefix,
										"rev-parse",
										"--git-common-dir",
									]) && probe.env.OWNED_FIXTURE_TOKEN === "exact-host",
						),
					).toBe(true);
				} else {
					await expect(outcome).rejects.toThrow();
					expect(writes).toEqual([]);
				}
			} finally {
				rmSync(owned, { recursive: true, force: true });
			}
		});
	const sha = "a".repeat(40);
	const target = "https://gl.example.test/Team/Widget.git";
	const metadata = {
		provider: "gitlab" as const,
		host: "gl.example.test",
		number: 12,
		headRefName: "Feature",
		headRefOid: sha,
		isCrossRepository: false,
		selectedRepositoryUrl: target,
		selectedRemoteName: "gitlab",
		selectedOrganizationId: "org",
		projectId: "7",
		sourceProjectId: "7",
		targetProjectId: "7",
	};
	function deferred() {
		let resolve: () => void = () => {};
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		return { promise, resolve };
	}
	function branchFixture() {
		let branch: string | null = null;
		const config = new Map<string, string>();
		let writes = 0;
		return {
			get branch() {
				return branch;
			},
			get writes() {
				return writes;
			},
			config,
			async raw(argv: string[]) {
				if (argv[0] === "config" && argv.includes("--get"))
					return argv.at(-1) === "remote.gitlab.url" ? target : "";
				if (argv[0] === "config") {
					writes++;
					config.set(argv[1] ?? "", argv[2] ?? "");
					return "";
				}
				if (argv[0] === "rev-parse") {
					if (argv.at(-1)?.startsWith("refs/heads/")) {
						if (!branch) throw new Error("unknown local branch");
						return branch;
					}
					return sha;
				}
				if (argv[0] === "branch" && argv[1] === "--no-track") {
					if (branch) throw new Error("branch already exists");
					branch = sha;
				}
				if (argv[0] === "branch" && argv[1] === "-D") branch = null;
				return "";
			},
		};
	}
	function crashPool(
		command: (argv: string[]) => Promise<string>,
		crashWhen: (argv: string[]) => boolean,
		strictScope?: string,
	) {
		const pool = new HostWorkerPool({
			scriptPathResolver: () => "/unused-owned-pure-worker",
		});
		const runner = pool.getRunner();
		if (!runner) throw new Error("expected lazy worker runner");
		let argv: string[] = [];
		let crashed = false;
		const task = defineWorkerTask(
			strictScope
				? {
						type: "git/pureMutationBoundary",
						handler: command,
						execution: "worker-only-nonreplay",
						mutationScope: () => strictScope,
					}
				: { type: "git/pureMutationBoundary", handler: command },
		);
		runner.runTask = async (_type, _payload, options) => {
			const result = await task.handler(argv);
			if (!crashed && crashWhen(argv)) {
				crashed = true;
				if (options?.quarantineDispatchedFailures)
					throw new WorkerTaskIndeterminateError(
						new Error("owned lost mutation result"),
					);
				throw new WorkerTaskError("owned crash after command success", {
					name: WORKER_CRASH_ERROR_NAME,
					message: "owned crash after command success",
				});
			}
			return JSON.parse(JSON.stringify(result));
		};
		return {
			pool,
			raw: async (args: string[]) => {
				argv = [...args];
				return pool.run(task, argv);
			},
		};
	}
	for (const command of ["branch", "worktree", "config"] as const) {
		test(`strict ${command} success with lost result rejects without replay or rollback`, async () => {
			const state = branchFixture();
			let mutations = 0;
			const scope = `/owned/strict-lost-${command}`;
			const isMutation = (argv: string[]) =>
				argv[0] === command &&
				(command !== "branch" || argv[1] === "--no-track") &&
				(command !== "config" || !argv.includes("--get"));
			const boundary = crashPool(
				async (argv) => {
					if (isMutation(argv)) mutations++;
					return state.raw(argv);
				},
				isMutation,
				scope,
			);
			execute = boundary.raw;
			const lease = await boundary.pool.acquireMutationScope(scope);
			const waiter = boundary.pool.acquireMutationScope(scope).then(
				() => "acquired",
				() => "quarantined",
			);
			try {
				const outcome =
					command === "worktree"
						? addWorktreeWithSparseCheckout({
								git: simpleGitModule.createUserSimpleGit(),
								worktreeArgs: ["/owned/worktree", "Feature"],
								worktreePath: "/owned/worktree",
								sparsePaths: [],
								logPrefix: "strict fixture",
							})
						: materializePrBranch({
								git: simpleGitModule.createUserSimpleGit(),
								branch: "Feature",
								remoteName: "gitlab",
								pr: metadata,
							});
				await expect(outcome).rejects.toThrow("owned lost mutation result");
				expect(mutations).toBe(1);
				expect(await waiter).toBe("quarantined");
				await expect(
					boundary.raw(["branch", "-D", "Feature"]),
				).rejects.toThrow();
				expect(mutations).toBe(1);
				if (command === "branch") expect(state.branch).toBe(sha);
			} finally {
				lease.release();
				await boundary.pool.dispose();
			}
		});
	}
	test("legacy replay reports an already-created branch as reused", async () => {
		const state = branchFixture();
		const boundary = crashPool(
			(argv) => state.raw(argv),
			(argv) => argv[0] === "branch" && argv[1] === "--no-track",
		);
		execute = boundary.raw;
		try {
			const result = await materializePrBranch({
				git: simpleGitModule.createUserSimpleGit(),
				branch: "Feature",
				remoteName: "gitlab",
				pr: metadata,
			});
			expect(state.branch).toBe(sha);
			expect(result.createdBranch).toBe(false);
		} finally {
			await boundary.pool.dispose();
		}
	});
	test("legacy replay reports a successful worktree add as a command failure", async () => {
		let exists = false;
		const boundary = crashPool(
			async (argv) => {
				if (argv[0] === "worktree" && argv[1] === "add") {
					if (exists) throw new Error("branch is already used by worktree");
					exists = true;
				}
				return "";
			},
			(argv) => argv[0] === "worktree" && argv[1] === "add",
		);
		execute = boundary.raw;
		try {
			await expect(
				addWorktreeWithSparseCheckout({
					git: simpleGitModule.createUserSimpleGit(),
					worktreeArgs: ["/owned/worktree", "Feature"],
					worktreePath: "/owned/worktree",
					sparsePaths: [],
					logPrefix: "owned pure fixture",
				}),
			).rejects.toThrow("branch is already used by worktree");
			expect(exists).toBe(true);
		} finally {
			await boundary.pool.dispose();
		}
	});
	test("absolute tracking write replay leaves the same verified configuration", async () => {
		const state = branchFixture();
		const boundary = crashPool(
			(argv) => state.raw(argv),
			(argv) => argv[0] === "config" && argv[1] === "branch.Feature.remote",
		);
		execute = boundary.raw;
		try {
			const result = await materializePrBranch({
				git: simpleGitModule.createUserSimpleGit(),
				branch: "Feature",
				remoteName: "gitlab",
				pr: metadata,
			});
			expect(result.createdBranch).toBe(true);
			expect(state.config.get("branch.Feature.remote")).toBe("gitlab");
			expect(state.config.get("branch.Feature.merge")).toBe(
				"refs/heads/Feature",
			);
			expect(state.writes).toBe(4);
		} finally {
			await boundary.pool.dispose();
		}
	});
	for (const failure of ["timeout", "abort"] as const) {
		test(`legacy inline ${failure} permits late completion after rollback`, async () => {
			const pool = new HostWorkerPool({ scriptPathResolver: () => null });
			const started = deferred();
			const release = deferred();
			const completed = deferred();
			let exists = false;
			const task = defineWorkerTask({
				type: "git/pureLateMutation",
				handler: async (argv: string[]) => {
					if (argv[0] === "worktree" && argv[1] === "add") {
						started.resolve();
						await release.promise;
						exists = true;
						completed.resolve();
					} else if (argv[0] === "worktree" && argv[1] === "remove") {
						exists = false;
					}
					return "";
				},
			});
			const controller = new AbortController();
			execute = (argv) =>
				pool.run(task, argv, {
					timeoutMs: failure === "timeout" ? 10 : 500,
					signal: failure === "abort" ? controller.signal : undefined,
				});
			const git = simpleGitModule.createUserSimpleGit();
			const outcome = addWorktreeWithSparseCheckout({
				git,
				worktreeArgs: ["/owned/worktree", "Feature"],
				worktreePath: "/owned/worktree",
				sparsePaths: [],
				logPrefix: "owned pure fixture",
			}).then(
				() => "resolved",
				() => "rejected",
			);
			try {
				await started.promise;
				if (failure === "abort") controller.abort();
				expect(await outcome).toBe("rejected");
				await pool.run(task, ["worktree", "remove", "/owned/worktree"]);
				expect(exists).toBe(false);
				release.resolve();
				await completed.promise;
				expect(exists).toBe(true);
			} finally {
				release.resolve();
				await completed.promise;
				await pool.dispose();
			}
		});
	}
}

const nativeDenialPreload = `const fs=require("node:fs"), path=require("node:path"), threads=require("node:worker_threads");
const deny=()=>{throw new Error("Owned fixture denied network");};
globalThis.fetch=deny;
for(const name of ["node:http","node:https"]){const mod=require(name);mod.request=deny;mod.get=deny;}
for(const name of ["node:net","node:tls"]){const mod=require(name);mod.connect=deny;mod.createConnection=deny;}
function check(file){if(typeof file==="string"&&path.basename(file).startsWith(".env"))throw new Error("Owned fixture denied dotenv filesystem read");}
for(const name of ["readFileSync","readFile"]){const original=fs[name];fs[name]=function(file,...args){check(file);return original.call(this,file,...args);};}
const original=fs.promises.readFile;fs.promises.readFile=async function(file,...args){check(file);return original.call(this,file,...args);};
if(process.env.SUPERSET_OWNED_PRELOAD_LOG)fs.appendFileSync(process.env.SUPERSET_OWNED_PRELOAD_LOG,(threads.isMainThread?"main:":"worker:")+threads.threadId+"\\n");
require("node:module").syncBuiltinESMExports();`;

async function nativeWorkerProof() {
	const assert: typeof import("node:assert/strict") = (
		await import("node:assert/strict")
	).default;
	const { execFileSync } = await import("node:child_process");
	const {
		mkdirSync,
		writeFileSync,
		readFileSync,
		existsSync,
		symlinkSync,
		realpathSync,
		rmSync,
		chmodSync,
	} = await import("node:fs");
	const { join } = await import("node:path");
	const { HostWorkerPool } = await import("../host-worker-pool");
	const { WorkerTaskIndeterminateError } = await import("../WorkerTaskRunner");
	const {
		gitResolveRepositoryTask,
		gitGitlabRawTask,
		gitConfirmNoPlatformRemotesTask,
	} = await import("./git");
	const { createGitlabWorkerGit } = await import(
		"../../trpc/router/workspaces/gitlab-worker-git"
	);
	const temp = process.argv[2];
	if (!temp?.startsWith("/tmp/superset-gitlab-worker-native-"))
		throw new Error("Unsafe owned fixture root");
	const root = join(temp, "repo"),
		linked = join(temp, "linked"),
		alias = join(temp, "alias"),
		pidFile = join(temp, "child.pid"),
		late = join(temp, "late.txt");
	const command = (...argv: string[]) =>
		execFileSync("git", argv, {
			cwd: root,
			encoding: "utf8",
			env: process.env,
		}).trim();
	mkdirSync(root);
	command("init", "--initial-branch=main");
	command("config", "user.name", "Fixture");
	command("config", "user.email", "fixture@example.test");
	writeFileSync(join(root, "file"), "owned\n");
	command("add", ".");
	command("commit", "-m", "owned");
	command(
		"remote",
		"add",
		"gitlab",
		"https://gl.example.test:8443/Team/Case.git",
	);
	command("worktree", "add", "-b", "linked", linked);
	symlinkSync(root, alias, "dir");
	const script = join(temp, "delay.sh");
	writeFileSync(
		script,
		`#!/bin/sh\nsleep 0.4 &\nchild=$!\necho "$$ $child" > '${pidFile}'\nwait "$child"\necho late > '${late}'\n`,
		{ mode: 0o700 },
	);
	command("config", "alias.owned-delay", `!${script}`);
	const pool = new HostWorkerPool({
		scriptPathResolver: () => join(temp, "host-worker.js"),
		concurrency: 1,
		execArgv: ["--require", join(temp, "deny.cjs")],
	});
	let lease: { release: () => void } | undefined;
	try {
		assert.equal(process.versions.bun, undefined);
		assert.match(process.versions.modules ?? "", /^[1-9]\d*$/);
		assert.equal(pool.getMode(), "worker");
		const selected = await pool.run(
			gitResolveRepositoryTask,
			{ repoPath: root, includeStorage: true },
			{ timeoutMs: 15000 },
		);
		const other = await pool.run(
			gitResolveRepositoryTask,
			{ repoPath: linked, includeStorage: true },
			{ timeoutMs: 15000 },
		);
		const symlinked = await pool.run(
			gitResolveRepositoryTask,
			{ repoPath: alias, includeStorage: true },
			{ timeoutMs: 15000 },
		);
		assert.ok(selected.storage);
		assert.deepEqual(other.storage, selected.storage);
		assert.deepEqual(symlinked.storage, selected.storage);
		assert.equal(
			selected.remotes.find(([name]) => name === "gitlab")?.[1].host,
			"gl.example.test:8443",
		);
		const git = await createGitlabWorkerGit(root, pool),
			otherGit = await createGitlabWorkerGit(linked, pool);
		lease = await git.acquireLease();
		await assert.rejects(git.raw(["not-an-owned-command"]));
		git.assertHealthy();
		assert.equal(
			(await git.raw(["rev-parse", "HEAD"])).trim(),
			command("rev-parse", "HEAD"),
		);
		const beforeAbort = new AbortController();
		beforeAbort.abort();
		await assert.rejects(
			pool.run(
				gitGitlabRawTask,
				{
					repoPath: root,
					storage: selected.storage,
					argv: ["status", "--porcelain"],
				},
				{ signal: beforeAbort.signal },
			),
		);
		git.assertHealthy();
		await assert.rejects(
			pool.run(gitGitlabRawTask, {
				repoPath: root,
				storage: { ...selected.storage, inode: selected.storage.inode + 1 },
				argv: ["config", "owned.invalid", "forbidden"],
			}),
		);
		git.assertHealthy();
		const foreign = join(temp, "foreign"),
			subdirectory = join(linked, "sub");
		mkdirSync(foreign);
		mkdirSync(join(foreign, "sub"));
		mkdirSync(subdirectory);
		execFileSync("git", ["init", "--initial-branch=main"], {
			cwd: foreign,
			env: process.env,
		});
		symlinkSync(subdirectory, join(root, "linked-link"), "dir");
		symlinkSync(join(foreign, "sub"), join(root, "foreign-link"), "dir");
		assert.equal(
			command("-C", "linked-link/..", "rev-parse", "--show-toplevel"),
			realpathSync(linked),
		);
		const allowedPrefixes = [
			["-C", linked],
			["-C", subdirectory],
			["-C", ""],
			["-c", "http.followRedirects=false", "-C", linked],
			["-C", "linked-link/.."],
			["-C", "linked-link", "-C", ".."],
			["-c", `core.worktree=${foreign}`],
		];
		for (const [index, prefix] of allowedPrefixes.entries()) {
			await git.raw([...prefix, "config", "owned.scope", `accepted-${index}`]);
			assert.equal(
				command("config", "--get", "owned.scope"),
				`accepted-${index}`,
			);
		}
		for (const prefix of [
			["-C", foreign],
			["-C", linked, "-C", "../foreign"],
			["-C", "foreign-link/.."],
			[`--git-dir=${join(foreign, ".git")}`],
		]) {
			await assert.rejects(
				git.raw([...prefix, "config", "owned.forbidden", "forbidden"]),
				`Unexpected accepted prefix: ${JSON.stringify(prefix)}`,
			);
			git.assertHealthy();
		}
		await git.raw([
			"-c",
			`core.worktree=${foreign}`,
			"checkout",
			"HEAD",
			"--",
			"file",
		]);
		assert.equal(readFileSync(join(root, "file"), "utf8"), "owned\n");
		assert.equal(existsSync(join(foreign, "file")), false);
		await assert.rejects(git.raw(["-C"]));
		assert.equal(
			command("config", "--get-regexp", "^owned\\."),
			"owned.scope accepted-6",
		);
		assert.throws(() =>
			execFileSync("git", ["config", "--get", "owned.forbidden"], {
				cwd: foreign,
				env: process.env,
			}),
		);
		const confirm = (repoPath: string) =>
			pool.run(
				gitConfirmNoPlatformRemotesTask,
				{ repoPath },
				{ timeoutMs: 15000 },
			);
		assert.deepEqual(await confirm(root), {
			repoPath: realpathSync(root),
			noPlatformRemote: false,
		});
		assert.deepEqual(await confirm(foreign), {
			repoPath: realpathSync(foreign),
			noPlatformRemote: true,
		});
		const bare = join(temp, "probe.git");
		execFileSync("git", ["init", "--bare", bare], { env: process.env });
		execFileSync("git", ["remote", "add", "origin", bare], {
			cwd: foreign,
			env: process.env,
		});
		assert.equal((await confirm(foreign)).noPlatformRemote, true);
		const configPath = join(foreign, ".git", "config");
		const config = readFileSync(configPath);
		try {
			writeFileSync(configPath, "[malformed\n");
			await assert.rejects(confirm(foreign));
		} finally {
			writeFileSync(configPath, config);
		}
		try {
			chmodSync(configPath, 0);
			await assert.rejects(confirm(foreign));
		} finally {
			chmodSync(configPath, 0o600);
		}
		assert.equal((await confirm(foreign)).noPlatformRemote, true);
		assert.equal(pool.getMode(), "worker");
		git.assertHealthy();
		let ticks = 0;
		const timer = setInterval(() => ticks++, 5);
		try {
			await git.raw(["owned-delay"]);
		} finally {
			clearInterval(timer);
		}
		assert.ok(
			ticks >= 10,
			"main thread remains responsive during actual worker Git command",
		);
		assert.equal(readFileSync(late, "utf8").trim(), "late");
		rmSync(late);
		rmSync(pidFile);
		const waiter = otherGit.acquireLease().then(
			() => "acquired",
			() => "quarantined",
		);
		const controller = new AbortController();
		const pending = pool.run(
			gitGitlabRawTask,
			{ repoPath: root, storage: selected.storage, argv: ["owned-delay"] },
			{ signal: controller.signal, timeoutMs: 5000 },
		);
		const deadline = Date.now() + 3000;
		while (!existsSync(pidFile)) {
			if (Date.now() > deadline)
				throw new Error("Owned delayed Git did not start");
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		controller.abort();
		await assert.rejects(
			pending,
			(error) => error instanceof WorkerTaskIndeterminateError,
		);
		assert.equal(await waiter, "quarantined");
		await assert.rejects(
			otherGit.raw(["config", "owned.rollback", "forbidden"]),
		);
		assert.throws(() => git.assertHealthy());
		await pool.dispose();
		const replacement = new HostWorkerPool({
			scriptPathResolver: () => join(temp, "host-worker.js"),
		});
		try {
			await assert.rejects(
				replacement.acquireMutationScope(selected.storage.commonDir),
			);
		} finally {
			await replacement.dispose();
		}
		await new Promise((resolve) => setTimeout(resolve, 600));
		console.log(
			JSON.stringify({
				proof: "production-worker",
				version: process.version,
				abi: process.versions.modules,
				ticks,
				lateAfterAbort: existsSync(late),
			}),
		);
	} finally {
		lease?.release();
		await pool.dispose();
		if (existsSync(pidFile)) {
			for (const value of readFileSync(pidFile, "utf8").trim().split(/\s+/)) {
				const pid = Number(value);
				if (Number.isInteger(pid) && pid > 1)
					try {
						process.kill(pid, "SIGKILL");
					} catch {}
			}
		}
	}
}
