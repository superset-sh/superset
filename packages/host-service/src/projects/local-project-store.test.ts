import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import type { ProjectChangedMessage } from "../events/types";
import type { HostServiceContext } from "../types";

if (process.env.SUPERSET_PROJECT_DELIVERY_FIXTURE !== "1") {
	test("project identity delivery exercises isolated SQLite and actual host/event callers", () => {
		const cwd = mkdtempSync("/tmp/superset-project-delivery-wrapper-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_PROJECT_DELIVERY_FIXTURE: "1",
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
	const deny = () => {
		throw Error("Unexpected actual native/provider boundary");
	};
	spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(deny, { preconnect: deny }),
	);
	spyOn(Bun, "spawn").mockImplementation(deny);
	spyOn(Bun, "spawnSync").mockImplementation(deny);
	const dotenvName: string = "dotenv";
	mock.module(dotenvName, () => ({ config: () => ({ parsed: {} }) }));
	mock.module("../terminal/clean-shell-env", () => ({
		getToolEnvironment: deny,
		getStrictShellEnvironment: deny,
		augmentPathForMacOS: deny,
		buildMinimalEnv: deny,
		parseEnvOutput: deny,
		clearStrictShellEnvCache() {},
	}));
	mock.module("../runtime/git/simple-git", () => ({
		createUserSimpleGit: deny,
	}));
	mock.module("../workers/host-worker-pool", () => ({
		getHostWorkerPool: deny,
	}));
	const schema = await import("../db/schema");
	const { projectRouter } = await import("../trpc/router/project/project");
	const { toProjectSnapshot, emitProjectChanged, updateLocalProject } =
		await import("./local-project-store");
	let sqlite: Database;
	let db: HostDb;
	let ctx: HostServiceContext;
	let events: Omit<ProjectChangedMessage, "type">[] = [];
	beforeEach(() => {
		sqlite = new Database(":memory:");
		const database = drizzle(sqlite, { schema });
		migrate(database, {
			migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
		});
		db = database as unknown as HostDb;
		events = [];
		ctx = {
			db,
			isAuthenticated: true,
			userId: "fixture-owner",
			eventBus: {
				broadcastProjectChanged: (event: Omit<ProjectChangedMessage, "type">) =>
					events.push(event),
			},
			api: {},
			credentials: { getToken: deny, getCredentials: deny },
		} as unknown as HostServiceContext;
	});
	afterEach(() => sqlite.close());
	const insert = (
		repoProvider: string | null = "gitlab",
		repoUrl:
			| string
			| null = "https://git.example.invalid:8443/Group/Sub/Widget",
	) => {
		db.insert(schema.projects)
			.values({
				id: "0c5c741b-7852-4ea8-ac9c-ad5a8aa10111",
				repoPath: "/tmp/delivery/Widget",
				name: "Native",
				repoProvider,
				repoOwner: repoUrl
					? repoProvider === "github"
						? "Acme"
						: "Group/Sub"
					: null,
				repoName: repoUrl ? "Widget" : null,
				repoUrl,
				createdAt: 1,
				updatedAt: 2,
			})
			.run();
		const row = db.select().from(schema.projects).get();
		if (!row) throw Error("Fixture row missing");
		return row;
	};
	for (const repoProvider of ["gitlab", "github", null])
		test(`actual list/get and project snapshot carry ${repoProvider}`, async () => {
			const row = insert(
				repoProvider,
				repoProvider === "github"
					? "https://github.com/Acme/Widget"
					: undefined,
			);
			const caller = projectRouter.createCaller(ctx);
			const listed = await caller.list();
			const got = await caller.get({ projectId: row.id });
			for (const projected of [listed[0], got, toProjectSnapshot(row)])
				expect(projected).toMatchObject({
					id: row.id,
					name: row.name,
					repoPath: row.repoPath,
					repoProvider,
					repoOwner: row.repoOwner,
					repoName: row.repoName,
					repoUrl: row.repoUrl,
					icon: null,
					color: null,
				});
			expect(listed[0]).toMatchObject({
				createdAt: 1,
				updatedAt: 2,
				tagSettings: [],
			});
			expect(got).toMatchObject({
				branchPrefixMode: null,
				branchPrefixCustom: null,
				sparseCheckoutPaths: [],
				namingInstructions: null,
			});
		});
	test("created and updated events retain provider while deleted event keeps null snapshot", () => {
		const row = insert();
		emitProjectChanged(ctx.eventBus, "created", row);
		expect(events[0]).toMatchObject({
			projectId: row.id,
			eventType: "created",
			project: { repoProvider: "gitlab", repoUrl: row.repoUrl },
		});
		updateLocalProject(ctx, row.id, { name: "Renamed" });
		expect(events[1]).toMatchObject({
			eventType: "updated",
			project: {
				name: "Renamed",
				repoProvider: "gitlab",
				repoUrl: row.repoUrl,
			},
		});
		emitProjectChanged(ctx.eventBus, "deleted", row.id);
		expect(events[2]).toMatchObject({
			projectId: row.id,
			eventType: "deleted",
			project: null,
		});
	});
	test("local-only rows retain original null identity and name fallback", () => {
		const row = insert(null, null);
		expect(toProjectSnapshot({ ...row, name: "" })).toMatchObject({
			name: "Widget",
			repoProvider: null,
			repoOwner: null,
			repoName: null,
			repoUrl: null,
		});
	});
}
