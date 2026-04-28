import os from "node:os";
import { getHostId, getHostName } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import type { ApiClient } from "../../../types";
import { protectedProcedure, router } from "../../index";

// 0.3.0: cloud `device.*` router renamed to `host.*`; `device.ensureV2Host`
// is now `host.ensure`, host registrations are keyed on (orgId, machineId)
// composite, and `targetHostId`/`v2_workspaces.host_id` are machineId text
// not uuid. Older host-service binaries call the now-removed `device.*`
// procedures and fail at registration.
// 0.2.0: `workspaceCreation.adopt` accepts optional `worktreePath`.
const HOST_SERVICE_VERSION = "0.3.0";
const ORGANIZATION_CACHE_TTL_MS = 60 * 60 * 1000;

let cachedOrganization: {
	data: { id: string; name: string; slug: string };
	cachedAt: number;
} | null = null;

async function getOrganization(
	api: ApiClient,
	organizationId: string,
): Promise<{ id: string; name: string; slug: string }> {
	if (
		cachedOrganization &&
		cachedOrganization.data.id === organizationId &&
		Date.now() - cachedOrganization.cachedAt < ORGANIZATION_CACHE_TTL_MS
	) {
		return cachedOrganization.data;
	}

	const organization = await api.organization.getByIdFromJwt.query({
		id: organizationId,
	});
	if (!organization) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Organization not found or not accessible from JWT",
		});
	}

	cachedOrganization = { data: organization, cachedAt: Date.now() };
	return organization;
}

export const hostRouter = router({
	info: protectedProcedure.query(async ({ ctx }) => {
		const organization = await getOrganization(ctx.api, ctx.organizationId);

		return {
			hostId: getHostId(),
			hostName: getHostName(),
			version: HOST_SERVICE_VERSION,
			organization,
			platform: os.platform(),
			uptime: process.uptime(),
		};
	}),
});
