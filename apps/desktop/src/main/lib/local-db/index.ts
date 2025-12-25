import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import * as schema from "@superset/local-db";
import { projects, settings, workspaces, worktrees } from "@superset/local-db";
import Database from "better-sqlite3";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { app } from "electron";
import { env } from "../../env.main";
import {
	DB_PATH as LEGACY_DB_PATH,
	SUPERSET_HOME_DIR,
} from "../app-environment";

const DB_PATH = join(SUPERSET_HOME_DIR, "local.db");

function ensureAppHomeDirExists() {
	mkdirSync(SUPERSET_HOME_DIR, { recursive: true });
}
ensureAppHomeDirExists();

/**
 * Gets the migrations directory path.
 *
 * Path resolution strategy:
 * - Production (packaged .app): resources/migrations/
 * - Development (NODE_ENV=development): packages/local-db/drizzle/
 * - Preview (electron-vite preview): dist/resources/migrations/
 * - Test environment: Use monorepo path relative to __dirname
 */
function getMigrationsDirectory(): string {
	// Check if running in Electron (app.getAppPath exists)
	const isElectron =
		typeof app?.getAppPath === "function" &&
		typeof app?.isPackaged === "boolean";

	if (isElectron && app.isPackaged) {
		return join(process.resourcesPath, "resources/migrations");
	}

	const isDev = env.NODE_ENV === "development";

	if (isElectron && isDev) {
		// Development: source files in monorepo
		return join(app.getAppPath(), "../../packages/local-db/drizzle");
	}

	// Preview mode or test: __dirname is dist/main, so go up one level to dist/resources/migrations
	const previewPath = join(__dirname, "../resources/migrations");
	if (existsSync(previewPath)) {
		return previewPath;
	}

	// Fallback: try monorepo path (for tests or dev without Electron)
	// From apps/desktop/src/main/lib/local-db -> packages/local-db/drizzle
	const monorepoPath = join(
		__dirname,
		"../../../../../packages/local-db/drizzle",
	);
	if (existsSync(monorepoPath)) {
		return monorepoPath;
	}

	// Try Electron app path if available
	if (isElectron) {
		const srcPath = join(app.getAppPath(), "../../packages/local-db/drizzle");
		if (existsSync(srcPath)) {
			return srcPath;
		}
	}

	console.warn(`[local-db] Migrations directory not found at: ${previewPath}`);
	return previewPath;
}

const migrationsFolder = getMigrationsDirectory();

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

console.log(`[local-db] Database initialized at: ${DB_PATH}`);
console.log(`[local-db] Running migrations from: ${migrationsFolder}`);

export const localDb = drizzle(sqlite, { schema });

migrate(localDb, { migrationsFolder });

console.log("[local-db] Migrations complete");

/**
 * Migrate data from legacy db.json (lowdb) to SQLite.
 * Only runs if:
 * 1. db.json exists
 * 2. SQLite projects table is empty (first run after migration)
 */
function migrateFromLegacyDb(): void {
	if (!existsSync(LEGACY_DB_PATH)) {
		return;
	}

	// Check if SQLite is empty
	const projectCount = localDb.select({ count: count() }).from(projects).get();
	if (projectCount && projectCount.count > 0) {
		console.log(
			"[local-db] SQLite already has data, skipping legacy migration",
		);
		return;
	}

	console.log("[local-db] Migrating data from legacy db.json...");

	try {
		const legacyData = JSON.parse(readFileSync(LEGACY_DB_PATH, "utf-8"));

		// Migrate projects
		if (legacyData.projects?.length > 0) {
			for (const p of legacyData.projects) {
				localDb
					.insert(projects)
					.values({
						id: p.id,
						mainRepoPath: p.mainRepoPath,
						name: p.name,
						color: p.color,
						tabOrder: p.tabOrder,
						lastOpenedAt: p.lastOpenedAt,
						createdAt: p.createdAt,
						configToastDismissed: p.configToastDismissed,
						defaultBranch: p.defaultBranch,
					})
					.run();
			}
			console.log(`[local-db] Migrated ${legacyData.projects.length} projects`);
		}

		// Migrate worktrees
		if (legacyData.worktrees?.length > 0) {
			for (const w of legacyData.worktrees) {
				localDb
					.insert(worktrees)
					.values({
						id: w.id,
						projectId: w.projectId,
						path: w.path,
						branch: w.branch,
						baseBranch: w.baseBranch,
						createdAt: w.createdAt,
						gitStatus: w.gitStatus,
						githubStatus: w.githubStatus,
					})
					.run();
			}
			console.log(
				`[local-db] Migrated ${legacyData.worktrees.length} worktrees`,
			);
		}

		// Migrate workspaces
		if (legacyData.workspaces?.length > 0) {
			for (const ws of legacyData.workspaces) {
				// Get branch from worktree if not set on workspace
				let branch = ws.branch;
				if (!branch && ws.worktreeId) {
					const worktree = legacyData.worktrees?.find(
						(wt: { id: string }) => wt.id === ws.worktreeId,
					);
					branch = worktree?.branch ?? "unknown";
				}

				localDb
					.insert(workspaces)
					.values({
						id: ws.id,
						projectId: ws.projectId,
						worktreeId: ws.worktreeId,
						type: ws.type ?? "worktree", // Default to worktree for legacy data
						branch: branch ?? "unknown",
						name: ws.name,
						tabOrder: ws.tabOrder,
						createdAt: ws.createdAt,
						updatedAt: ws.updatedAt,
						lastOpenedAt: ws.lastOpenedAt,
					})
					.run();
			}
			console.log(
				`[local-db] Migrated ${legacyData.workspaces.length} workspaces`,
			);
		}

		// Migrate settings
		if (legacyData.settings) {
			const s = legacyData.settings;
			localDb
				.insert(settings)
				.values({
					id: 1,
					lastActiveWorkspaceId: s.lastActiveWorkspaceId,
					lastUsedApp: s.lastUsedApp,
					terminalPresets: s.terminalPresets,
					terminalPresetsInitialized: s.terminalPresetsInitialized,
					selectedRingtoneId: s.selectedRingtoneId,
				})
				.run();
			console.log("[local-db] Migrated settings");
		}

		// Backup the legacy db.json
		const backupPath = `${LEGACY_DB_PATH}.backup`;
		renameSync(LEGACY_DB_PATH, backupPath);
		console.log(`[local-db] Legacy db.json backed up to ${backupPath}`);

		console.log("[local-db] Legacy migration complete!");
	} catch (error) {
		console.error("[local-db] Failed to migrate legacy data:", error);
		// Don't throw - app can continue with empty db
	}
}

migrateFromLegacyDb();

export type LocalDb = typeof localDb;
