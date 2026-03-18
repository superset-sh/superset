import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import {
	encryptOAuthToken,
	isOAuthTokenEncrypted,
} from "@superset/shared/oauth-token-crypto";
import { eq } from "drizzle-orm";

interface BackfillOptions {
	dryRun: boolean;
	batchSize: number;
}

interface BackfillStats {
	scannedRows: number;
	updatedRows: number;
	skippedRows: number;
	encryptedAccessTokens: number;
	encryptedRefreshTokens: number;
}

function parseBatchSize(rawValue: string): number {
	const value = Number.parseInt(rawValue, 10);
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`Invalid --batch-size value: ${rawValue}`);
	}
	return value;
}

function parseOptions(args: string[]): BackfillOptions {
	const options: BackfillOptions = {
		dryRun: false,
		batchSize: 100,
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}

		if (arg.startsWith("--batch-size=")) {
			options.batchSize = parseBatchSize(arg.split("=")[1] ?? "");
			continue;
		}

		if (arg === "--batch-size") {
			const nextArg = args[index + 1];
			if (!nextArg) {
				throw new Error("Missing value for --batch-size");
			}
			options.batchSize = parseBatchSize(nextArg);
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

function encryptIfNeeded(token: string): { value: string; changed: boolean } {
	if (isOAuthTokenEncrypted(token)) {
		return { value: token, changed: false };
	}
	return { value: encryptOAuthToken(token), changed: true };
}

async function runBackfill(options: BackfillOptions): Promise<void> {
	const stats: BackfillStats = {
		scannedRows: 0,
		updatedRows: 0,
		skippedRows: 0,
		encryptedAccessTokens: 0,
		encryptedRefreshTokens: 0,
	};

	let offset = 0;

	console.log(
		`[oauth-backfill] Starting backfill (dryRun=${options.dryRun}, batchSize=${options.batchSize})`,
	);

	while (true) {
		const rows = await db.query.integrationConnections.findMany({
			columns: {
				id: true,
				accessToken: true,
				refreshToken: true,
				createdAt: true,
			},
			orderBy: (table, { asc }) => [asc(table.createdAt), asc(table.id)],
			limit: options.batchSize,
			offset,
		});

		if (rows.length === 0) {
			break;
		}

		for (const row of rows) {
			stats.scannedRows += 1;

			const accessResult = encryptIfNeeded(row.accessToken);
			const refreshResult = row.refreshToken
				? encryptIfNeeded(row.refreshToken)
				: null;

			const accessChanged = accessResult.changed;
			const refreshChanged = refreshResult ? refreshResult.changed : false;

			if (!accessChanged && !refreshChanged) {
				stats.skippedRows += 1;
				continue;
			}

			stats.updatedRows += 1;
			if (accessChanged) {
				stats.encryptedAccessTokens += 1;
			}
			if (refreshChanged) {
				stats.encryptedRefreshTokens += 1;
			}

			if (!options.dryRun) {
				const setValues: { accessToken?: string; refreshToken?: string | null } = {};
				if (accessChanged) {
					setValues.accessToken = accessResult.value;
				}
				if (refreshResult && refreshChanged) {
					setValues.refreshToken = refreshResult.value;
				}
				await db
					.update(integrationConnections)
					.set(setValues)
					.where(eq(integrationConnections.id, row.id));
			}
		}

		offset += rows.length;
		console.log(
			`[oauth-backfill] Processed ${stats.scannedRows} rows total (updated=${stats.updatedRows}, skipped=${stats.skippedRows})`,
		);
	}

	console.log("[oauth-backfill] Complete");
	console.log(`[oauth-backfill] scanned_rows=${stats.scannedRows}`);
	console.log(`[oauth-backfill] updated_rows=${stats.updatedRows}`);
	console.log(`[oauth-backfill] skipped_rows=${stats.skippedRows}`);
	console.log(
		`[oauth-backfill] encrypted_access_tokens=${stats.encryptedAccessTokens}`,
	);
	console.log(
		`[oauth-backfill] encrypted_refresh_tokens=${stats.encryptedRefreshTokens}`,
	);
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	await runBackfill(options);
}

main().catch((error: Error) => {
	console.error(`[oauth-backfill] Failed: ${error.message}`);
	process.exitCode = 1;
});
