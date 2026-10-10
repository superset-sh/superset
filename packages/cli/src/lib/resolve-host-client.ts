import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import type { CliContext } from "./command";
import { type HostServiceClient, resolveHostTarget } from "./host-target";

/** A client for `--host`, or for this machine's host when it is not given. */
export async function resolveHostClient(
	ctx: CliContext,
	options: { host?: string | null },
): Promise<HostServiceClient> {
	const organizationId = ctx.config.organizationId;
	if (!organizationId) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}
	const target = await resolveHostTarget({
		requestedHostId: options.host ?? getHostId(),
		organizationId,
		userJwt: ctx.bearer,
		api: ctx.api,
	});
	return target.client;
}
