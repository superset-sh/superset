import { createHmac } from "node:crypto";
import { env } from "@/env";
import { getExternalApiUrl } from "@/lib/external-api-url";

export function generateConnectUrl({
	slackUserId,
	teamId,
}: {
	slackUserId: string;
	teamId: string;
}): string {
	const payload = JSON.stringify({
		slackUserId,
		teamId,
		exp: Date.now() + 10 * 60 * 1000,
	});
	const signature = createHmac("sha256", env.SLACK_SIGNING_SECRET)
		.update(payload)
		.digest("hex");
	const token = Buffer.from(payload).toString("base64url");
	const connectUrl = new URL(getExternalApiUrl("/api/integrations/slack/link"));
	connectUrl.searchParams.set("token", token);
	connectUrl.searchParams.set("sig", signature);
	return connectUrl.toString();
}
