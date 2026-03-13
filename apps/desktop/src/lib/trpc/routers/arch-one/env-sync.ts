import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { publicProcedure, router } from "../..";

interface EnvFileStatus {
	name: string;
	relativePath: string;
	exists: boolean;
	hash: string | null;
	lastModified: string | null;
	keyCount: number;
}

interface EnvSyncResult {
	files: EnvFileStatus[];
	inSync: boolean;
	staleFiles: string[];
}

const ENV_FILES = [
	{ name: "Edge Functions", relativePath: "supabase/functions/.env" },
	{ name: "Droplet Server", relativePath: "droplet-server/.env" },
	{ name: "Frontend", relativePath: "frontend/.env.local" },
	{ name: "Scripts", relativePath: "scripts/.env.local" },
] as const;

function hashEnvKeys(content: string): string {
	// Parse env content, extract key=value pairs, sort by key, hash
	const lines = content
		.split("\n")
		.filter((l) => l.trim() && !l.startsWith("#"))
		.map((l) => l.trim())
		.sort();
	return createHash("md5").update(lines.join("\n")).digest("hex").slice(0, 8);
}

function countKeys(content: string): number {
	return content
		.split("\n")
		.filter((l) => l.trim() && !l.startsWith("#") && l.includes("=")).length;
}

export const createEnvSyncRouter = () => {
	return router({
		getEnvSyncStatus: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.query(({ input }): EnvSyncResult => {
				const files: EnvFileStatus[] = ENV_FILES.map((envFile) => {
					const fullPath = join(input.worktreePath, envFile.relativePath);
					if (!existsSync(fullPath)) {
						return {
							name: envFile.name,
							relativePath: envFile.relativePath,
							exists: false,
							hash: null,
							lastModified: null,
							keyCount: 0,
						};
					}
					try {
						const content = readFileSync(fullPath, "utf-8");
						const stat = statSync(fullPath);
						return {
							name: envFile.name,
							relativePath: envFile.relativePath,
							exists: true,
							hash: hashEnvKeys(content),
							lastModified: stat.mtime.toISOString(),
							keyCount: countKeys(content),
						};
					} catch {
						return {
							name: envFile.name,
							relativePath: envFile.relativePath,
							exists: false,
							hash: null,
							lastModified: null,
							keyCount: 0,
						};
					}
				});

				// Time-based staleness: files are "stale" if modified >5 min before the newest
				const existingFiles = files.filter((f) => f.exists && f.lastModified);
				const latestTime = existingFiles.reduce((max, f) => {
					const t = new Date(f.lastModified ?? 0).getTime();
					return t > max ? t : max;
				}, 0);

				const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
				const staleFiles = latestTime
					? existingFiles
							.filter((f) => {
								const t = new Date(f.lastModified ?? 0).getTime();
								return latestTime - t > STALE_THRESHOLD_MS;
							})
							.map((f) => f.name)
					: [];

				return {
					files,
					inSync: staleFiles.length === 0,
					staleFiles,
				};
			}),
	});
};
