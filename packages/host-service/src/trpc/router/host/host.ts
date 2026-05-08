import os from "node:os";
import hostServicePackageJson from "@superset/host-service/package.json" with {
	type: "json",
};
import { getHostId, getHostName } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import type { ApiClient } from "../../../types";
import { protectedProcedure, router } from "../../index";

// Auto-derived from this package's package.json so a host-service version
// bump automatically flows through to `host.info` and the desktop's
// strict-equality adoption check (see host-service-coordinator.tryAdopt).
const HOST_SERVICE_VERSION: string = hostServicePackageJson.version;

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
