import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

export function verifySlackSignature({
	body,
	signature,
	timestamp,
}: {
	body: string;
	signature: string;
	timestamp: string;
}): boolean {
	// Reject timestamps >5 min old to prevent replay attacks
	const timestampSec = Number.parseInt(timestamp, 10);
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - timestampSec) > 60 * 5) {
		console.error("[slack/verify-signature] Timestamp too old or in future");
		return false;
	}

	const sigBase = `v0:${timestamp}:${body}`;
	const mySignature = `v0=${createHmac("sha256", env.SLACK_SIGNING_SECRET).update(sigBase).digest("hex")}`;

	try {
		return timingSafeEqual(
			Buffer.from(mySignature, "utf8"),
			Buffer.from(signature, "utf8"),
		);
	} catch {
		return false;
	}
}
