import { isStrictProfile } from "@superset/shared/deployment-profile";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "../env";

// 10 invitations per hour per user
export const invitationRateLimit =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Ratelimit({
				redis: new Redis({
					url: env.KV_REST_API_URL,
					token: env.KV_REST_API_TOKEN,
				}),
				limiter: Ratelimit.slidingWindow(10, "1 h"),
				prefix: "ratelimit:invitation",
			})
		: null;

export async function checkInvitationRateLimit(
	inviterId: string,
): Promise<void> {
	if (!invitationRateLimit) {
		if (isStrictProfile()) {
			throw new Error("Invitation rate limiting is not configured.");
		}
		return;
	}

	const limit = await invitationRateLimit.limit(inviterId);
	if (!limit.success) {
		throw new Error("Rate limit exceeded. Max 10 invitations per hour.");
	}
}
