import "server-only";

import { FEATURE_FLAGS } from "@superset/shared/constants";
import { unstable_cache } from "next/cache";
import { posthogServer } from "./posthog-server";

const SITE_DISTINCT_ID = "marketing-site";
const REVALIDATE_SECONDS = 60;

const evaluateSiteFlag = unstable_cache(
	async (flag: string) =>
		Boolean(
			await posthogServer.getFeatureFlag(flag, SITE_DISTINCT_ID, {
				sendFeatureFlagEvents: false,
			}),
		),
	["site-flag"],
	{ revalidate: REVALIDATE_SECONDS },
);

/** A flag evaluated once for the whole site. Any failure reads as off. */
export async function getSiteFlag(flag: string): Promise<boolean> {
	try {
		return await evaluateSiteFlag(flag);
	} catch (error) {
		console.error(`[site-flags] Failed to load ${flag}`, error);
		return false;
	}
}

export function isMobileLaunched(): Promise<boolean> {
	return getSiteFlag(FEATURE_FLAGS.MOBILE_LAUNCH);
}
