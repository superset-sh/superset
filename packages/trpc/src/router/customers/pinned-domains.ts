import { kv } from "@vercel/kv";

import { env } from "../../env";

/** Team-shared list of pinned domains (key accounts), in pin order. */

const KEY = `customers:pinned-domains:${env.NODE_ENV}`;
const isKVConfigured = Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
let memoryPinned: string[] = [];

export async function getPinnedDomains(): Promise<string[]> {
	if (isKVConfigured) {
		try {
			return (await kv.get<string[]>(KEY)) ?? [];
		} catch {
			// Fall through to memory on KV error
		}
	}
	return memoryPinned;
}

export async function setPinnedDomains(domains: string[]): Promise<void> {
	if (isKVConfigured) {
		try {
			await kv.set(KEY, domains);
			return;
		} catch {
			// Fall through to memory on KV error
		}
	}
	memoryPinned = domains;
}
