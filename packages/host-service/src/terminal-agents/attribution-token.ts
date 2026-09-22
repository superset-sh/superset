import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const secret = randomBytes(32);

export function issueAttributionToken(terminalId: string): string {
	return createHmac("sha256", secret).update(terminalId).digest("hex");
}

export function verifyAttributionToken(
	terminalId: string,
	token: string | undefined,
): boolean {
	if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
	return timingSafeEqual(
		Buffer.from(token, "hex"),
		Buffer.from(issueAttributionToken(terminalId), "hex"),
	);
}
