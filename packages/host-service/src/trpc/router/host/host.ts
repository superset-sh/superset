import os from "node:os";
import { getHostId, getHostName } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import {
	getHostInstallSource,
	HOST_SERVICE_VERSION,
} from "../../../install-source";
import type { ApiClient } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { rethrowCloudUnreachable } from "./cloud-api-error";

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

	let organization: { id: string; name: string; slug: string } | null;
	try {
		organization = await api.organization.getByIdFromJwt.query({
			id: organizationId,
		});
	} catch (error) {
		rethrowCloudUnreachable(error);
		throw error;
	}
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
			installSource: getHostInstallSource(),
			organization,
			platform: os.platform(),
			arch: os.arch(),
			uptime: process.uptime(),
		};
	}),
});
