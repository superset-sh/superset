import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createDb, type HostDb } from "@superset/host-service/db";
import { settings } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import { SUPERSET_HOME_DIR } from "./app-environment";
import {
	isProcessAlive,
	manifestDir,
	readManifest,
} from "./host-service-manifest";

let cachedOrganizationId: string | null = null;
let cachedDbPath: string | null = null;
let cachedDb: HostDb | null = null;

export interface HostDbManifestCandidate {
	organizationId: string;
	startedAt: number;
	isAlive: boolean;
}

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

export function selectFallbackOrganizationId(
	candidates: HostDbManifestCandidate[],
): string | null {
	return (
		[...candidates].sort(
			(a, b) =>
				Number(b.isAlive) - Number(a.isAlive) || b.startedAt - a.startedAt,
		)[0]?.organizationId ?? null
	);
}

function getActiveOrganizationId(): string | null {
	try {
		const row = localDb
			.select({ activeOrganizationId: settings.activeOrganizationId })
			.from(settings)
			.get();
		const organizationId = row?.activeOrganizationId;
		if (typeof organizationId === "string" && organizationId.trim() !== "") {
			return organizationId;
		}
	} catch (error) {
		console.warn("[host-db] Failed to read active organization id", error);
	}

	const hostRoot = join(SUPERSET_HOME_DIR, "host");
	if (!existsSync(hostRoot)) {
		return null;
	}

	try {
		const candidates = readdirSync(hostRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => {
				const manifest = readManifest(entry.name);
				if (!manifest) return null;

				return {
					organizationId: entry.name,
					startedAt: manifest.startedAt,
					isAlive: isProcessAlive(manifest.pid),
				};
			})
			.filter(
				(
					candidate,
				): candidate is {
					organizationId: string;
					startedAt: number;
					isAlive: boolean;
				} => candidate !== null,
			);

		return selectFallbackOrganizationId(candidates);
	} catch (error) {
		console.warn("[host-db] Failed to infer active organization id", error);
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
