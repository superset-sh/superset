import { LRUCache } from "lru-cache";
import { createApiClient } from "./api-client";

const allowedCache = new LRUCache<string, true>({
	max: 50_000,
	ttl: 5 * 60 * 1000,
});

export type AccessResult =
	| { ok: true }
	| { ok: false; reason: "no_access" | "paid_plan_required" };

export async function checkHostAccess(
	token: string,
	hostId: string,
): Promise<AccessResult> {
	const key = `${token}:${hostId}`;
	if (allowedCache.has(key)) return { ok: true };

	try {
		const client = createApiClient(token);
		const result = await client.host.checkAccess.query({ hostId });
		if (!result.allowed) return { ok: false, reason: "no_access" };
		if (!result.paidPlan) return { ok: false, reason: "paid_plan_required" };
		allowedCache.set(key, true);
		return { ok: true };
	} catch {
		return { ok: false, reason: "no_access" };
	}
}
