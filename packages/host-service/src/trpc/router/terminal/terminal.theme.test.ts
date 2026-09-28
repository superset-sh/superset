import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db/index.ts";
import * as schema from "../../../db/schema.ts";
import { terminalSessions } from "../../../db/schema.ts";

process.env.ORGANIZATION_ID = "00000000-0000-4000-8000-000000000000";
process.env.HOST_SERVICE_SECRET = "test-secret";
process.env.HOST_DB_PATH = "/tmp/test-host.db";
process.env.HOST_MIGRATIONS_FOLDER = "/tmp/test-migrations";
process.env.AUTH_TOKEN = "test-auth-token";
process.env.SUPERSET_API_URL = "https://cloud.example.com";

const { appRouter } = await import("../router.ts");

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function setup() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as unknown as Parameters<typeof migrate>[0], {
		migrationsFolder: MIGRATIONS_FOLDER,
	});
	db.insert(terminalSessions)
		.values({
			id: "term-1",
			status: "active",
			originWorkspaceId: "ws-1",
			createdAt: Date.now(),
		})
		.run();
	const caller = appRouter.createCaller({
		isAuthenticated: true,
		organizationId: process.env.ORGANIZATION_ID,
		db,
	} as unknown as Parameters<typeof appRouter.createCaller>[0]);
	const storedThemeId = () =>
		db
			.select({ themeId: terminalSessions.themeId })
			.from(terminalSessions)
			.where(eq(terminalSessions.id, "term-1"))
			.get()?.themeId;
	return { caller, storedThemeId };
}

describe("terminal.setTheme", () => {
	test("stores a theme and clears it again", async () => {
		const { caller, storedThemeId } = setup();

		await caller.terminal.setTheme({
			terminalId: "term-1",
			workspaceId: "ws-1",
			themeId: "monokai",
		});
		expect(storedThemeId()).toBe("monokai");

		await caller.terminal.setTheme({
			terminalId: "term-1",
			workspaceId: "ws-1",
			themeId: null,
		});
		expect(storedThemeId()).toBeNull();
	});

	test("rejects a session from another workspace", async () => {
		const { caller, storedThemeId } = setup();

		await expect(
			caller.terminal.setTheme({
				terminalId: "term-1",
				workspaceId: "ws-2",
				themeId: "monokai",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(storedThemeId()).toBeNull();
	});

	test("rejects an unknown terminal", async () => {
		const { caller } = setup();

		await expect(
			caller.terminal.setTheme({
				terminalId: "missing",
				workspaceId: "ws-1",
				themeId: "monokai",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
