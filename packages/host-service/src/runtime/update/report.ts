import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ApiClient } from "../../types";

interface SupervisorResult {
	succeeded?: boolean;
	finalVersion?: string;
	error?: string;
	completedAt?: number;
}

function lastUpdatePath(organizationId: string): string {
	const home = process.env.SUPERSET_HOME_DIR || join(homedir(), ".superset");
	return join(home, "host", organizationId, "last-update.json");
}

function readResult(path: string): SupervisorResult | null {
	try {
		const raw = readFileSync(path, "utf-8");
		const parsed = JSON.parse(raw) as SupervisorResult;
		if (typeof parsed.succeeded !== "boolean") return null;
		return parsed;
	} catch {
		return null;
	}
}

/**
 * If the supervisor wrote a `last-update.json` for this org, report the
 * outcome to the cloud and delete the file. Best-effort — failures here
 * shouldn't block daemon startup.
 *
 * Called once at daemon startup. The cloud finds the most recent
 * `dispatched` audit row in the last 15 minutes and flips it.
 */
export async function reportPendingUpdate(
	api: ApiClient,
	organizationId: string,
	machineId: string,
): Promise<void> {
	const path = lastUpdatePath(organizationId);
	if (!existsSync(path)) return;

	const result = readResult(path);
	if (!result) {
		try {
			rmSync(path, { force: true });
		} catch {
			// best-effort
		}
		return;
	}

	try {
		await api.host.reportUpdate.mutate({
			organizationId,
			machineId,
			succeeded: result.succeeded ?? false,
			finalVersion: result.finalVersion,
			error: result.error?.slice(0, 1000),
		});
	} catch (err) {
		console.error(
			"[host-service] failed to report update outcome:",
			err instanceof Error ? err.message : err,
		);
	} finally {
		try {
			rmSync(path, { force: true });
		} catch {
			// best-effort
		}
	}
}
