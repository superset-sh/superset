import os from "node:os";
import { getDeviceName, getHashedDeviceId } from "@superset/shared/device-info";
import { TRPCError } from "@trpc/server";
import type { ApiClient } from "../../../types";
import { protectedProcedure, router } from "../../index";

// 0.2.0: `workspaceCreation.adopt` accepts optional `worktreePath` for
// adopting worktrees at arbitrary paths (not just <repoPath>/.worktrees/).
// The v1→v2 migration depends on this to adopt legacy ~/.superset/worktrees
// paths. Clients using the new param must refuse to adopt an older service.
const HOST_SERVICE_VERSION = "0.2.0";
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
			hostId: getHashedDeviceId(),
			hostName: getDeviceName(),
			version: HOST_SERVICE_VERSION,
			organization,
			platform: os.platform(),
			uptime: process.uptime(),
		};
	}),
});
