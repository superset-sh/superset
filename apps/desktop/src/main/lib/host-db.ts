import { existsSync } from "node:fs";
import { join } from "node:path";
import { createDb, type HostDb } from "@superset/host-service/db";
import { settings } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import { manifestDir } from "./host-service-manifest";

let cachedOrganizationId: string | null = null;
let cachedDbPath: string | null = null;
let cachedDb: HostDb | null = null;

function getHostMigrationsDirectory(): string | null {
	const packagedPath = join(process.resourcesPath, "resources/host-migrations");
	if (existsSync(packagedPath)) {
		return packagedPath;
	}

	const previewPath = join(__dirname, "../resources/host-migrations");
	if (existsSync(previewPath)) {
		return previewPath;
	}

	const monorepoPath = join(
		__dirname,
		"../../../../../packages/host-service/drizzle",
	);
	if (existsSync(monorepoPath)) {
		return monorepoPath;
	}

	console.error("[host-db] Migrations directory not found", {
		packagedPath,
		previewPath,
		monorepoPath,
	});
	return null;
}

function getActiveOrganizationId(): string | null {
	try {
		const row = localDb
			.select({ activeOrganizationId: settings.activeOrganizationId })
			.from(settings)
			.get();
		const organizationId = row?.activeOrganizationId;
		return typeof organizationId === "string" && organizationId.trim() !== ""
			? organizationId
			: null;
	} catch (error) {
		console.warn("[host-db] Failed to read active organization id", error);
		return null;
	}
}

export function getActiveHostDbPath(): string | null {
	const organizationId = getActiveOrganizationId();
	return organizationId ? join(manifestDir(organizationId), "host.db") : null;
}

export function getActiveHostDb(): HostDb | null {
	const organizationId = getActiveOrganizationId();
	if (!organizationId) {
		return null;
	}

	const dbPath = join(manifestDir(organizationId), "host.db");
	if (
		cachedDb &&
		cachedOrganizationId === organizationId &&
		cachedDbPath === dbPath
	) {
		return cachedDb;
	}

	if (cachedDb) {
		try {
			(
				cachedDb as unknown as { $client?: { close: () => void } }
			).$client?.close();
		} catch (error) {
			console.warn("[host-db] Failed to close previous host db", error);
		}
		cachedDb = null;
		cachedOrganizationId = null;
		cachedDbPath = null;
	}

	const migrationsDir = getHostMigrationsDirectory();
	if (!migrationsDir) {
		return null;
	}

	cachedDb = createDb(dbPath, migrationsDir);
	cachedOrganizationId = organizationId;
	cachedDbPath = dbPath;
	return cachedDb;
}
