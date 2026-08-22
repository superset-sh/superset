import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import type { CliContext } from "../../lib/command";
import {
	type HostServiceClient,
	type HostWsEndpoint,
	resolveHostTarget,
} from "../../lib/host-target";

/**
 * Resolve a host-service client (and its WS endpoint) for a workspace's host.
 * Shared by every `superset browser` leaf.
 */
export async function resolveBrowserTarget(
	ctx: CliContext,
	options: { workspace: string; host?: string | null },
): Promise<{ client: HostServiceClient; hostId: string; ws: HostWsEndpoint }> {
	const organizationId = ctx.config.organizationId;
	if (!organizationId) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}
	const hostId = options.host ?? getHostId();
	const target = await resolveHostTarget({
		requestedHostId: hostId,
		organizationId,
		userJwt: ctx.bearer,
		api: ctx.api,
	});
	return { client: target.client, hostId, ws: target.ws };
}
