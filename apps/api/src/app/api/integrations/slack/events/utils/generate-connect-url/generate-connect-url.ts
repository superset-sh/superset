import { createHmac } from "node:crypto";
import { env } from "@/env";

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
	return `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/link?token=${token}&sig=${signature}`;
}
