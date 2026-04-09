import os from "node:os";
import { getDeviceName, getHashedDeviceId } from "@superset/shared/device-info";
import { TRPCError } from "@trpc/server";
import type { ApiClient } from "../../../types";
import { protectedProcedure, router } from "../../index";

const HOST_SERVICE_VERSION = "0.1.0";
const ORGANIZATION_CACHE_TTL_MS = 60 * 60 * 1000;

let cachedOrganization: {
	data: { id: string; name: string; slug: string };
	cachedAt: number;
} | null = null;

async function getOrganization(
	api: ApiClient,
): Promise<{ id: string; name: string; slug: string }> {
	if (
		cachedOrganization &&
		Date.now() - cachedOrganization.cachedAt < ORGANIZATION_CACHE_TTL_MS
	) {
		return cachedOrganization.data;
	}

	const organization = await api.organization.getActiveFromJwt.query();
	if (!organization) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "No active organization",
		});
	}

	cachedOrganization = { data: organization, cachedAt: Date.now() };
	return organization;
}

export const hostRouter = router({
	info: protectedProcedure.query(async ({ ctx }) => {
		const api = (ctx as { api: ApiClient }).api;
		const organization = await getOrganization(api);

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
