import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

export function verifySvixSignature({
	secret,
	id,
	timestamp,
	signature,
	payload,
}: {
	secret: string;
	id: string;
	timestamp: string;
	signature: string;
	payload: string;
}): boolean {
	const timestampSeconds = Number.parseInt(timestamp, 10);
	if (Number.isNaN(timestampSeconds)) {
		return false;
	}
	const nowSeconds = Math.floor(Date.now() / 1000);
	if (Math.abs(nowSeconds - timestampSeconds) > TOLERANCE_SECONDS) {
		return false;
	}

	const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
	const expected = createHmac("sha256", key)
		.update(`${id}.${timestamp}.${payload}`)
		.digest();

	return signature.split(" ").some((candidate) => {
		const [version, value] = candidate.split(",");
		if (version !== "v1" || !value) {
			return false;
		}
		const provided = Buffer.from(value, "base64");
		return (
			provided.length === expected.length && timingSafeEqual(provided, expected)
		);
	});
}
