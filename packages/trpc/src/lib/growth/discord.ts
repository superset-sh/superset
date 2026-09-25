import { COMPANY } from "@superset/shared/constants";

import { cachedGrowthMetric } from "./cache";
import { fetchWithTimeout } from "./fetch";

const CACHE_KEY = "discord";
const CACHE_TTL_SECONDS = 30 * 60;

export type DiscordStats =
	| { available: true; members: number; online: number; fetchedAt: string }
	| { available: false; reason: string };

// The invite endpoint reports approximate member and presence counts without
// a bot token, which is all a headline number needs.
async function fetchDiscord(): Promise<DiscordStats> {
	const code = new URL(COMPANY.DISCORD_URL).pathname.split("/").pop();
	if (!code) return { available: false, reason: "no invite code" };
	const response = await fetchWithTimeout(
		`https://discord.com/api/v10/invites/${code}?with_counts=true`,
	);
	if (!response.ok) {
		return {
			available: false,
			reason: `Discord API error (${response.status})`,
		};
	}
	const data = (await response.json()) as {
		approximate_member_count?: number;
		approximate_presence_count?: number;
	};
	return {
		available: true,
		members: data.approximate_member_count ?? 0,
		online: data.approximate_presence_count ?? 0,
		fetchedAt: new Date().toISOString(),
	};
}

export function fetchDiscordStats(): Promise<DiscordStats> {
	return cachedGrowthMetric(CACHE_KEY, CACHE_TTL_SECONDS, fetchDiscord);
}
