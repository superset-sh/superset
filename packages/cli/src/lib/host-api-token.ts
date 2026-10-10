import type { AppRouter as HostServiceRouter } from "@superset/host-service/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { isProcessAlive, readManifest } from "./host/manifest";

const HOST_API_TOKEN_TIMEOUT_MS = 500;

/**
 * In a Superset terminal, the API token of the account that runs the
 * workspace's host, so the CLI acts as that account and not its own login.
 * Null outside one, or when the host is down or too old to give one.
 */
export async function readHostApiToken(
	timeoutMs = HOST_API_TOKEN_TIMEOUT_MS,
): Promise<string | null> {
	const organizationId = process.env.SUPERSET_ORGANIZATION_ID?.trim();
	if (!organizationId || !process.env.SUPERSET_WORKSPACE_ID) return null;
	if (process.env.SUPERSET_SANDBOX_WORKSPACE_ID) return null;

	const manifest = readManifest(organizationId);
	if (!manifest || !isProcessAlive(manifest.pid)) return null;

	const host = createTRPCClient<HostServiceRouter>({
		links: [
			httpBatchLink({
				url: `${manifest.endpoint}/trpc`,
				transformer: SuperJSON,
				headers: { Authorization: `Bearer ${manifest.authToken}` },
			}),
		],
	});
	try {
		const { token } = await host.host.apiToken.query(undefined, {
			signal: AbortSignal.timeout(timeoutMs),
		});
		return token;
	} catch {
		return null;
	}
}
