import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { projectRouter } from "./project";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const PROJECT_ID = "1f0e8c7e-1234-4abc-8def-0123456789ab";
const WORKSPACE_ID = "2f0e8c7e-1234-4abc-8def-0123456789ab";

interface Sandbox {
	repoPath: string;
	cleanup: () => void;
}

function createRepo(): Sandbox {
	const root = mkdtempSync(join(tmpdir(), "project-router-test-"));
	const repoPath = join(root, "repo");
	mkdirSync(repoPath, { recursive: true });
	return {
		repoPath,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

interface Harness {
	caller: ReturnType<typeof projectRouter.createCaller>;
	db: ReturnType<typeof drizzle<typeof schema>>;
	cloudDelete: ReturnType<typeof mock>;
}

function createHarness(opts: {
	repoPath: string;
	cloudDeleteImpl?: () => Promise<unknown>;
	overrideDelete?: (
		realDb: ReturnType<typeof drizzle<typeof schema>>,
	) => Pick<ReturnType<typeof drizzle<typeof schema>>, "delete">["delete"];
}): Harness {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

	db.insert(schema.projects)
		.values({ id: PROJECT_ID, repoPath: opts.repoPath })
		.run();
	db.insert(schema.workspaces)
		.values({
			id: WORKSPACE_ID,
			projectId: PROJECT_ID,
			worktreePath: opts.repoPath,
			branch: "main",
		})
		.run();

	const cloudDelete = mock(
		opts.cloudDeleteImpl ?? (async () => ({ success: true })),
	);

	const dbForCtx = opts.overrideDelete
		? new Proxy(db, {
				get(target, prop, receiver) {
					if (prop === "delete") return opts.overrideDelete?.(target);
					return Reflect.get(target, prop, receiver);
				},
			})
		: db;

	const ctx = {
		db: dbForCtx,
		api: {
			v2Project: {
				delete: { mutate: cloudDelete },
			},
		},
		git: async () => ({
			raw: async () => "",
		}),
		organizationId: "org-1",
		isAuthenticated: true,
	} as unknown as HostServiceContext;

	return {
		caller: projectRouter.createCaller(ctx),
		db,
		cloudDelete,
	};
}

describe("projectRouter.remove", () => {
	let sandbox: Sandbox;

	beforeEach(() => {
		sandbox = createRepo();
	});

	afterEach(() => {
		sandbox.cleanup();
	});

	it("removes the project + workspaces from the local DB on the happy path", async () => {
		const { caller, db } = createHarness({ repoPath: sandbox.repoPath });

		const result = await caller.remove({ projectId: PROJECT_ID });

		expect(result.success).toBe(true);
		const remainingProjects = db.select().from(schema.projects).all();
		const remainingWorkspaces = db.select().from(schema.workspaces).all();
		expect(remainingProjects.length).toBe(0);
		expect(remainingWorkspaces.length).toBe(0);
	});

	// Reproduces issue #4282: when the local-DB cleanup step fails after the
	// cloud delete has already succeeded, the mutation must surface the failure
	// so the UI can warn the user. Previously the error was caught and logged
	// while `success: true` was still returned, so the UI showed "deleted" even
	// though the project row remained — and a daemon restart didn't help
	// because the row was still there.
	it("surfaces local DB failures instead of silently returning success", async () => {
		const { caller, db, cloudDelete } = createHarness({
			repoPath: sandbox.repoPath,
			overrideDelete: () => () => {
				throw new Error("simulated sqlite failure");
			},
		});

		await expect(caller.remove({ projectId: PROJECT_ID })).rejects.toThrow(
			/simulated sqlite failure|local/i,
		);

		expect(cloudDelete).toHaveBeenCalledTimes(1);
		const remainingProjects = db.select().from(schema.projects).all();
		expect(remainingProjects.length).toBe(1);
	});
});
