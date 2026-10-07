import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import type { HostServiceContext } from "../../../types";

if (process.env.SUPERSET_NATIVE_PROJECT_FIXTURE !== "1") {
	test("native project lifecycle uses isolated actual SQLite/router callers", () => {
		const cwd = mkdtempSync("/tmp/superset-native-project-wrapper-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_NATIVE_PROJECT_FIXTURE: "1",
					},
					stdout: "pipe",
					stderr: "pipe",
					timeout: 30000,
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.exitCode).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 35000);
} else {
	const dotenvName: string = "dotenv";
	mock.module(dotenvName, () => ({ config: () => ({ parsed: {} }) }));
	mock.module("../../../terminal/clean-shell-env", () => ({
		getToolEnvironment: async () => ({}),
		getStrictShellEnvironment: async () => ({}),
		augmentPathForMacOS: () => "",
		buildMinimalEnv: () => ({}),
		parseEnvOutput: () => ({}),
		clearStrictShellEnvCache() {},
	}));
	let repositories: Map<string, Map<string, string>>;
	let cloneRemote: string | null;
	let cloneCalls: { url: string; path: string; env?: Record<string, string> }[];
	mock.module("../../../runtime/git/simple-git", () => ({
		createUserSimpleGit: (
			path?: string,
			options?: { env?: Record<string, string> },
		) => {
			let environment = options?.env;
			const git = {
				env: (value: Record<string, string>) => {
					environment = value;
					return git;
				},
				clone: async (url: string, target: string) => {
					cloneCalls.push({ url, path: target, env: environment });
					repositories.set(target, new Map([["origin", cloneRemote ?? url]]));
				},
				revparse: async () => {
					if (!path || !repositories.has(path))
						throw new Error("Not a git repository");
					return path;
				},
				raw: async (args: string[]) => {
					if (!path || !repositories.has(path))
						throw new Error("Not a git repository");
					if (args[0] === "config")
						return [...(repositories.get(path) ?? [])]
							.map(([name, url]) => `remote.${name}.url ${url}`)
							.join("\n");
					if (args[0] === "rev-parse") return "owned-head";
					throw new Error(`Unexpected Git boundary: ${args.join(" ")}`);
				},
			};
			return git;
		},
	}));
	const { parseGitRemote } = await import("@superset/shared/git-remote");
	let workerRequests: { type: string; repoPath: string }[];
	mock.module("../../../workers/host-worker-pool", () => ({
		getHostWorkerPool: () => ({
			run: async (task: { type: string }, input: { repoPath: string }) => {
				workerRequests.push({ type: task.type, repoPath: input.repoPath });
				if (task.type !== "git/resolveRepository")
					throw new Error("Unexpected worker task");
				const remotes = [...(repositories.get(input.repoPath) ?? [])].flatMap(
					([name, url]) => {
						const parsed = parseGitRemote(url);
						return parsed ? [[name, parsed] as const] : [];
					},
				);
				return { repoPath: input.repoPath, remotes };
			},
		}),
	}));
	const schema = await import("../../../db/schema");
	const { projects, workspaces } = schema;
	const { projectRouter } = await import("./project");
	let sqlite: Database;
	let db: HostDb;
	let ctx: HostServiceContext;
	let scratch: string;
	let tokenHosts: string[];
	let credentialUrls: string[];
	let requests: { url: URL; init?: RequestInit }[];
	let respond: (url: URL, init?: RequestInit) => Response | Promise<Response>;
	const originalFetch = globalThis.fetch;
	const PUBLIC = "https://gitlab.com/Group/SubGroup/Widget.git";
	const PRIVATE = "https://git.example.invalid:8443/Group/SubGroup/Widget.git";
	const VERSION = { version: "18.4.0", revision: "abcdef012345" };
	beforeEach(() => {
		scratch = mkdtempSync("/tmp/superset-native-project-");
		repositories = new Map();
		cloneRemote = null;
		cloneCalls = [];
		tokenHosts = [];
		credentialUrls = [];
		requests = [];
		workerRequests = [];
		sqlite = new Database(":memory:");
		const database = drizzle(sqlite, { schema });
		migrate(database, {
			migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
		});
		db = database as unknown as HostDb;
		ctx = {
			db,
			isAuthenticated: true,
			eventBus: new Proxy({}, { get: () => () => {} }),
			api: {},
			credentials: {
				getToken: async (host: string) => {
					tokenHosts.push(host);
					return "owned-fixture-token";
				},
				getCredentials: async (url: string) => {
					credentialUrls.push(url);
					return { env: { OWNED_CREDENTIAL_FIXTURE: "1" } };
				},
			},
		} as unknown as HostServiceContext;
		respond = () => Response.json(VERSION);
		globalThis.fetch = Object.assign(
			async (input: string | URL | Request, init?: RequestInit) => {
				const url = new URL(
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url,
				);
				requests.push({ url, init });
				return respond(url, init);
			},
			{ preconnect() {} },
		);
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
		sqlite.close();
		rmSync(scratch, { recursive: true, force: true });
	});
	const repo = (url?: string, name = "imported") => {
		const path = join(scratch, name);
		mkdirSync(path);
		repositories.set(path, new Map(url ? [["origin", url]] : []));
		return path;
	};
	const row = (id: string) =>
		db.select().from(projects).where(eq(projects.id, id)).get();
	const caller = () => projectRouter.createCaller(ctx);
	const expected = (host: string) => ({
		repoProvider: "gitlab",
		repoOwner: "Group/SubGroup",
		repoName: "Widget",
		repoUrl: `https://${host}/Group/SubGroup/Widget`,
		remoteName: "origin",
	});

	test("new native remote reads dispatch the existing typed worker task", async () => {
		const path = repo(PUBLIC);
		const result = await caller().create({
			name: "Native",
			mode: { kind: "importLocal", repoPath: path },
		});
		expect(row(result.projectId)).toMatchObject(expected("gitlab.com"));
		expect(workerRequests).toEqual([
			{ type: "git/resolveRepository", repoPath: path },
			{ type: "git/resolveRepository", repoPath: path },
		]);
	});
	test("actual create clone persists public native identity and exact credential URL", async () => {
		const result = await caller().create({
			name: "Native",
			mode: { kind: "clone", parentDir: scratch, url: PUBLIC },
		});
		expect(row(result.projectId)).toMatchObject(expected("gitlab.com"));
		expect(result.repoPath).toBe(join(scratch, "Widget"));
		expect(credentialUrls).toEqual([PUBLIC]);
		expect(cloneCalls[0]?.env).toEqual({ OWNED_CREDENTIAL_FIXTURE: "1" });
		expect(requests).toEqual([]);
		expect(tokenHosts).toEqual([]);
	});
	test("actual import persists custom authority only after positive current native proof", async () => {
		const path = repo(PRIVATE);
		const result = await caller().create({
			name: "Native",
			mode: { kind: "importLocal", repoPath: path },
		});
		expect(row(result.projectId)).toMatchObject(
			expected("git.example.invalid:8443"),
		);
		expect(requests.map(({ url }) => url.href)).toEqual([
			"https://git.example.invalid:8443/api/v4/version",
		]);
	});
	test("authenticated native proof resolves exactly the selected authority once", async () => {
		respond = (_url, init) =>
			new Headers(init?.headers).has("Authorization")
				? Response.json(VERSION)
				: new Response(null, { status: 401 });
		const result = await caller().create({
			name: "Private",
			mode: { kind: "importLocal", repoPath: repo(PRIVATE) },
		});
		expect(row(result.projectId)).toMatchObject(
			expected("git.example.invalid:8443"),
		);
		expect(tokenHosts).toEqual(["git.example.invalid:8443"]);
		expect(requests).toHaveLength(2);
		expect(requests.every(({ init }) => init?.redirect === "error")).toBe(true);
	});
	for (const status of [403, 503])
		test(`unknown ${status} proof preserves truthful metadata with null provider`, async () => {
			respond = () => new Response(null, { status });
			const result = await caller().create({
				name: "Unknown",
				mode: { kind: "importLocal", repoPath: repo(PRIVATE) },
			});
			expect(row(result.projectId)).toMatchObject({
				...expected("git.example.invalid:8443"),
				repoProvider: null,
			});
		});
	test("GitHub priority and original mapping survive a native origin without native probes", async () => {
		const path = repo(PRIVATE);
		repositories.get(path)?.set("upstream", "git@github.com:Owner/Repo.git");
		const result = await caller().create({
			name: "GH",
			mode: { kind: "importLocal", repoPath: path },
		});
		expect(row(result.projectId)).toMatchObject({
			repoProvider: "github",
			repoOwner: "Owner",
			repoName: "Repo",
			repoUrl: "https://github.com/Owner/Repo",
			remoteName: "upstream",
		});
		expect(requests).toEqual([]);
		expect(tokenHosts).toEqual([]);
	});
	test("local import keeps null repository metadata without provider or credential calls", async () => {
		const result = await caller().create({
			name: "Local",
			mode: { kind: "importLocal", repoPath: repo() },
		});
		expect(row(result.projectId)).toMatchObject({
			repoProvider: null,
			repoOwner: null,
			repoName: null,
			repoUrl: null,
			remoteName: null,
		});
		expect(requests).toEqual([]);
		expect(credentialUrls).toEqual([]);
	});
	test("same-path reimport preserves UUID and custom identity without a new probe", async () => {
		const path = repo(PRIVATE);
		const id = randomUUID();
		db.insert(projects)
			.values({
				id,
				repoPath: path,
				name: "Custom",
				color: "#112233",
				icon: "none",
				repoProvider: "gitlab",
				repoOwner: "Saved",
				repoName: "Saved",
				repoUrl: "https://saved.invalid/Saved/Saved",
			})
			.run();
		const result = await caller().create({
			name: "Replace",
			mode: { kind: "importLocal", repoPath: path },
		});
		expect(result).toEqual({ projectId: id, repoPath: path, created: false });
		expect(row(id)).toMatchObject({
			name: "Custom",
			color: "#112233",
			icon: "none",
			repoOwner: "Saved",
		});
		expect(requests).toEqual([]);
		expect(db.select().from(projects).all()).toHaveLength(1);
	});
	test("remote retarget during proof refuses import before persistence and retains user folder", async () => {
		const path = repo(PRIVATE);
		respond = () => {
			repositories
				.get(path)
				?.set("origin", "https://other.invalid/Group/SubGroup/Widget.git");
			return Response.json(VERSION);
		};
		await expect(
			caller().create({
				name: "Race",
				mode: { kind: "importLocal", repoPath: path },
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(db.select().from(projects).all()).toEqual([]);
		expect(existsSync(path)).toBe(true);
	});
	test("remote removal during proof refuses fresh clone and rolls back its claimed directory", async () => {
		respond = () => {
			repositories.get(join(scratch, "Widget"))?.delete("origin");
			return Response.json(VERSION);
		};
		await expect(
			caller().create({
				name: "Race",
				mode: { kind: "clone", parentDir: scratch, url: PRIVATE },
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(db.select().from(projects).all()).toEqual([]);
		expect(existsSync(join(scratch, "Widget"))).toBe(false);
	});
	for (const kind of ["clone", "import"] as const)
		test(`second-host ${kind} retains supplied UUID and native full identity`, async () => {
			const id = randomUUID();
			const path = kind === "import" ? repo(PRIVATE) : join(scratch, "Widget");
			const result = await caller().setup({
				projectId: id,
				origin: { repoCloneUrl: PRIVATE, name: "Second host" },
				mode:
					kind === "clone"
						? { kind, parentDir: scratch }
						: { kind, repoPath: path, allowRelocate: false },
			});
			expect(result.repoPath).toBe(path);
			expect(row(id)).toMatchObject({
				...expected("git.example.invalid:8443"),
				id,
				name: "Second host",
			});
			expect(db.select().from(projects).all()).toHaveLength(1);
		});
	for (const wrong of [
		"https://other.invalid/Group/SubGroup/Widget.git",
		"https://git.example.invalid:9443/Group/SubGroup/Widget.git",
		"https://git.example.invalid:8443/group/SubGroup/Widget.git",
		"https://git.example.invalid:8443/Group/SubGroup/widget.git",
	])
		test(`native setup refuses mismatched exact identity ${wrong}`, async () => {
			const path = repo(wrong);
			await expect(
				caller().setup({
					projectId: randomUUID(),
					origin: { repoCloneUrl: PRIVATE },
					mode: { kind: "import", repoPath: path, allowRelocate: false },
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(db.select().from(projects).all()).toEqual([]);
			expect(requests).toEqual([]);
			expect(existsSync(path)).toBe(true);
		});
	test("post-clone native identity mismatch rolls back before provider proof", async () => {
		cloneRemote = "https://git.example.invalid:9443/Group/SubGroup/Widget.git";
		await expect(
			caller().create({
				name: "Wrong",
				mode: { kind: "clone", parentDir: scratch, url: PRIVATE },
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(existsSync(join(scratch, "Widget"))).toBe(false);
		expect(requests).toEqual([]);
	});
	test("second-host clone proof failure cleans only new folder and leaves supplied UUID absent", async () => {
		const id = randomUUID();
		respond = () => {
			repositories
				.get(join(scratch, "Widget"))
				?.set("origin", "https://other.invalid/Group/SubGroup/Widget.git");
			return Response.json(VERSION);
		};
		await expect(
			caller().setup({
				projectId: id,
				origin: { repoCloneUrl: PRIVATE },
				mode: { kind: "clone", parentDir: scratch },
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(row(id)).toBeUndefined();
		expect(existsSync(join(scratch, "Widget"))).toBe(false);
	});
	test("native setup cannot steal a path already owned by another project", async () => {
		const path = repo(PRIVATE);
		const owner = randomUUID();
		db.insert(projects)
			.values({ id: owner, repoPath: path, name: "Owner" })
			.run();
		await expect(
			caller().setup({
				projectId: randomUUID(),
				origin: { repoCloneUrl: PRIVATE },
				mode: { kind: "import", repoPath: path, allowRelocate: false },
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(db.select().from(projects).all()).toHaveLength(1);
		expect(row(owner)?.name).toBe("Owner");
	});
	test("native setup protects repoint and allows explicit relocation with workspace update", async () => {
		const old = repo(PRIVATE, "old");
		const next = repo(PRIVATE, "next");
		const id = randomUUID();
		const workspaceId = randomUUID();
		db.insert(projects).values({ id, repoPath: old, name: "Native" }).run();
		db.insert(workspaces)
			.values({
				id: workspaceId,
				projectId: id,
				name: "Main",
				type: "local",
				worktreePath: old,
				branch: "main",
			})
			.run();
		await expect(
			caller().setup({
				projectId: id,
				origin: { repoCloneUrl: PRIVATE },
				mode: { kind: "import", repoPath: next, allowRelocate: false },
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(row(id)?.repoPath).toBe(old);
		await caller().setup({
			projectId: id,
			origin: { repoCloneUrl: PRIVATE },
			mode: { kind: "import", repoPath: next, allowRelocate: true },
		});
		expect(row(id)?.repoPath).toBe(next);
		expect(db.select().from(workspaces).get()?.worktreePath).toBe(next);
	});
	test("same-path native setup remains idempotent and preserves custom row without probe", async () => {
		const path = repo(PRIVATE);
		const id = randomUUID();
		db.insert(projects)
			.values({
				id,
				repoPath: path,
				name: "Custom",
				color: "#112233",
				icon: "none",
			})
			.run();
		await caller().setup({
			projectId: id,
			origin: { repoCloneUrl: PRIVATE, name: "Replace" },
			mode: { kind: "import", repoPath: path, allowRelocate: false },
		});
		expect(row(id)).toMatchObject({
			name: "Custom",
			color: "#112233",
			icon: "none",
		});
		expect(requests).toEqual([]);
	});
	test("native import reuses a path claimed during proof and preserves its current custom row", async () => {
		const path = repo(PRIVATE);
		const id = randomUUID();
		respond = () => {
			db.insert(projects)
				.values({
					id,
					repoPath: path,
					name: "Concurrent custom",
					color: "#112233",
					icon: "none",
				})
				.run();
			return Response.json(VERSION);
		};
		const result = await caller().create({
			name: "Replace",
			mode: { kind: "importLocal", repoPath: path },
		});
		expect(result).toEqual({ projectId: id, repoPath: path, created: false });
		expect(db.select().from(projects).all()).toHaveLength(1);
		expect(row(id)).toMatchObject({
			name: "Concurrent custom",
			color: "#112233",
			icon: "none",
		});
	});
	test("native setup rechecks path ownership claimed during awaited proof", async () => {
		const path = repo(PRIVATE);
		const owner = randomUUID();
		const id = randomUUID();
		respond = () => {
			db.insert(projects)
				.values({ id: owner, repoPath: path, name: "Current owner" })
				.run();
			return Response.json(VERSION);
		};
		await expect(
			caller().setup({
				projectId: id,
				origin: { repoCloneUrl: PRIVATE },
				mode: { kind: "import", repoPath: path, allowRelocate: false },
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(row(id)).toBeUndefined();
		expect(row(owner)?.repoPath).toBe(path);
		expect(existsSync(path)).toBe(true);
	});
	for (const kind of ["clone", "import"] as const)
		test(`native ${kind} setup rechecks a UUID created at another path during proof`, async () => {
			const previous = repo(PRIVATE, "previous");
			const id = randomUUID();
			const path =
				kind === "import" ? repo(PRIVATE, "current") : join(scratch, "Widget");
			respond = () => {
				db.insert(projects)
					.values({
						id,
						repoPath: previous,
						name: "Current custom",
						color: "#112233",
					})
					.run();
				return Response.json(VERSION);
			};
			await expect(
				caller().setup({
					projectId: id,
					origin: { repoCloneUrl: PRIVATE },
					mode:
						kind === "clone"
							? { kind, parentDir: scratch }
							: { kind, repoPath: path, allowRelocate: false },
				}),
			).rejects.toMatchObject({ code: "CONFLICT" });
			expect(row(id)).toMatchObject({
				repoPath: previous,
				name: "Current custom",
				color: "#112233",
			});
			expect(existsSync(path)).toBe(kind === "import");
		});
	test("native clone setup cannot delete a folder claimed by another UUID during proof", async () => {
		const path = join(scratch, "Widget");
		const owner = randomUUID();
		const id = randomUUID();
		respond = () => {
			db.insert(projects)
				.values({ id: owner, repoPath: path, name: "Current owner" })
				.run();
			return Response.json(VERSION);
		};
		await expect(
			caller().setup({
				projectId: id,
				origin: { repoCloneUrl: PRIVATE },
				mode: { kind: "clone", parentDir: scratch },
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(row(id)).toBeUndefined();
		expect(row(owner)?.repoPath).toBe(path);
		expect(existsSync(path)).toBe(true);
	});
	test("native setup preserves same-path customizations created during proof", async () => {
		const path = repo(PRIVATE);
		const id = randomUUID();
		respond = () => {
			db.insert(projects)
				.values({
					id,
					repoPath: path,
					name: "Current custom",
					color: "#112233",
					icon: "none",
				})
				.run();
			return Response.json(VERSION);
		};
		await caller().setup({
			projectId: id,
			origin: { repoCloneUrl: PRIVATE, name: "Replace" },
			mode: { kind: "import", repoPath: path, allowRelocate: false },
		});
		expect(row(id)).toMatchObject({
			name: "Current custom",
			color: "#112233",
			icon: "none",
		});
	});
	test("original GitHub second-host import retains case-insensitive slug behavior", async () => {
		const path = repo("git@github.com:Owner/Repo.git");
		const id = randomUUID();
		await caller().setup({
			projectId: id,
			origin: { repoCloneUrl: "https://github.com/owner/repo", name: "GH" },
			mode: { kind: "import", repoPath: path, allowRelocate: false },
		});
		expect(row(id)).toMatchObject({
			repoProvider: "github",
			repoOwner: "Owner",
			repoName: "Repo",
		});
		expect(requests).toEqual([]);
	});
}
