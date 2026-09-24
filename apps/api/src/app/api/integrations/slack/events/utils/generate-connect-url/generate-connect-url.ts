import { createHmac } from "node:crypto";
import { env } from "@/env";

export interface PendingUnfurl {
	channel: string;
	ts: string;
	url: string;
}

export interface ConnectPayload {
	slackUserId: string;
	teamId: string;
	exp: number;
	/** A link Slack held back until this user connected; unfurled on success. */
	unfurl?: PendingUnfurl;
}

export function generateConnectUrl({
	slackUserId,
	teamId,
	unfurl,
}: {
	slackUserId: string;
	teamId: string;
	unfurl?: PendingUnfurl;
}): string {
	const payload = JSON.stringify({
		slackUserId,
		teamId,
		exp: Date.now() + 10 * 60 * 1000,
		...(unfurl ? { unfurl } : {}),
	} satisfies ConnectPayload);
	const signature = createHmac("sha256", env.SLACK_SIGNING_SECRET)
		.update(payload)
		.digest("hex");
	const token = Buffer.from(payload).toString("base64url");
	return `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/link?token=${token}&sig=${signature}`;
}
