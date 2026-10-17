import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { projects } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { createCallerFactory } from "../../index";
import { projectRouter } from "./project";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

describe("project.get", () => {
	it("reports whether the project folder is still on disk", async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema });
		migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
		const repoPath = mkdtempSync(join(tmpdir(), "project-get-test-"));
		const projectId = randomUUID();
		db.insert(projects)
			.values({ id: projectId, repoPath, name: "acme-web", updatedAt: 1 })
			.run();
		const caller = createCallerFactory(projectRouter)({
			db: db as unknown as HostDb,
			isAuthenticated: true,
			organizationId: "org-test",
		} as unknown as HostServiceContext);

		expect((await caller.get({ projectId }))?.repoPathExists).toBe(true);
		rmSync(repoPath, { recursive: true, force: true });
		expect((await caller.get({ projectId }))?.repoPathExists).toBe(false);
	});
});
