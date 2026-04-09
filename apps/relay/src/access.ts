import { LRUCache } from "lru-cache";
import { createApiClient } from "./api-client";

const allowedCache = new LRUCache<string, true>({
	max: 50_000,
	ttl: 5 * 60 * 1000,
});

export async function checkHostAccess(
	token: string,
	hostId: string,
): Promise<boolean> {
	const key = `${token}:${hostId}`;
	if (allowedCache.has(key)) return true;

	try {
		const client = createApiClient(token);
		const result = await client.device.checkHostAccess.query({ hostId });
		if (result.allowed) {
			allowedCache.set(key, true);
		}
		return result.allowed;
	} catch {
		return false;
	}
}
