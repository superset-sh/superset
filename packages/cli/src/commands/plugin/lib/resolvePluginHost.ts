import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import type { CliContext } from "../../../lib/command";
import {
	type HostFlags,
	type ResolvedHostTarget,
	resolveHostFilter,
	resolveHostTarget,
} from "../../../lib/host-target";

export async function resolvePluginHost(
	ctx: CliContext,
	flags: HostFlags,
): Promise<ResolvedHostTarget> {
	const organizationId = ctx.config.organizationId;
	if (!organizationId) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}
	const hostId = resolveHostFilter(flags) ?? getHostId();
	return resolveHostTarget({
		requestedHostId: hostId,
		organizationId,
		userJwt: ctx.bearer,
		api: ctx.api,
	});
}
