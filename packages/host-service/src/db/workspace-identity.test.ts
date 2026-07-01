import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");
const PROJECT_ID = "1f0e8c7e-1234-4abc-8def-0123456789ab";
const WORKSPACE_ID = "2f0e8c7e-1234-4abc-8def-0123456789ab";

function migratedDb() {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	db.insert(schema.projects)
		.values({ id: PROJECT_ID, repoPath: "/tmp/r" })
		.run();
	return db;
}

function readWorkspace(db: ReturnType<typeof migratedDb>) {
	return db
		.select()
		.from(schema.workspaces)
		.where(eq(schema.workspaces.id, WORKSPACE_ID))
		.all()[0];
}

// Increment 1 of the local-first workspace plan: host-service SQLite carries the
// full workspace identity, not just the disk path.
describe("workspaces identity columns (migration 0006)", () => {
	it("persists name/type/organizationId/taskId/createdByUserId", () => {
		const db = migratedDb();
		db.insert(schema.workspaces)
			.values({
				id: WORKSPACE_ID,
				projectId: PROJECT_ID,
				worktreePath: "/tmp/r/.wt/feature",
				branch: "feature",
				name: "Feature work",
				type: "worktree",
				organizationId: "org-1",
				taskId: "task-1",
				createdByUserId: "user-1",
			})
			.run();

		expect(readWorkspace(db)).toMatchObject({
			name: "Feature work",
			type: "worktree",
			organizationId: "org-1",
			taskId: "task-1",
			createdByUserId: "user-1",
		});
	});

	it("leaves identity columns null when omitted (pre-migration rows)", () => {
		const db = migratedDb();
		db.insert(schema.workspaces)
			.values({
				id: WORKSPACE_ID,
				projectId: PROJECT_ID,
				worktreePath: "/tmp/r",
				branch: "main",
			})
			.run();

		const row = readWorkspace(db);
		expect(row?.name).toBeNull();
		expect(row?.organizationId).toBeNull();
		expect(row?.createdByUserId).toBeNull();
	});
});
