import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getHostId } from "@superset/shared/host-info";
import type { ApiClient } from "../api-client";
import { SUPERSET_HOME_DIR } from "../config";
import { resolveHostFilter } from "../host-target";

const AVAILABILITY_PATH = join(SUPERSET_HOME_DIR, "cloud-availability.json");
const AVAILABILITY_TTL_MS = 60 * 60_000;
const AVAILABILITY_TIMEOUT_MS = 2_000;

/**
 * The host a workspace command targets, or undefined for the cloud. `--local`
 * and `--host` always win. Without them the default is the cloud only for an
 * account that can use cloud workspaces; everyone else keeps this machine, so
 * no existing script or agent changes behaviour.
 */
export async function resolveWorkspaceHost(
	flags: { host?: string | null; local?: boolean | null },
	api: ApiClient,
	organizationId: string,
): Promise<string | undefined> {
	const explicit = resolveHostFilter({
		host: flags.host ?? undefined,
		local: flags.local ?? undefined,
	});
	if (explicit) return explicit;
	return (await cloudWorkspacesAvailable(api, organizationId))
		? undefined
		: getHostId();
}

/**
 * Asked of the API at most hourly per organization and cached, so local
 * commands don't pay a round trip each run. An API that can't answer — offline,
 * or too old to have the query — counts as unavailable: the fallback is this
 * machine, never the cloud.
 */
async function cloudWorkspacesAvailable(
	api: ApiClient,
	organizationId: string,
): Promise<boolean> {
	const cache = readCache();
	const cached = cache[organizationId];
	if (cached && Date.now() - cached.checkedAt < AVAILABILITY_TTL_MS) {
		return cached.available;
	}
	let available = false;
	try {
		const result = await api.cloudWorkspace.available.query(undefined, {
			signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS),
		});
		available = result.available;
	} catch {
		available = false;
	}
	cache[organizationId] = { available, checkedAt: Date.now() };
	try {
		writeFileSync(AVAILABILITY_PATH, JSON.stringify(cache), { mode: 0o600 });
	} catch {
		// Uncached, the next command asks again.
	}
	return available;
}

function readCache(): Record<
	string,
	{ available: boolean; checkedAt: number }
> {
	if (!existsSync(AVAILABILITY_PATH)) return {};
	try {
		return JSON.parse(readFileSync(AVAILABILITY_PATH, "utf8"));
	} catch {
		return {};
	}
}
