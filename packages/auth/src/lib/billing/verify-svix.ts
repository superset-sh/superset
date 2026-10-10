import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

export function verifySvixSignature(args: {
	secret: string;
	id: string | null;
	timestamp: string | null;
	signature: string | null;
	body: string;
	now?: number;
}): boolean {
	const { id, timestamp, signature } = args;
	if (!id || !timestamp || !signature) return false;
	const seconds = Number(timestamp);
	const now = (args.now ?? Date.now()) / 1000;
	if (!Number.isFinite(seconds) || Math.abs(now - seconds) > TOLERANCE_SECONDS)
		return false;
	const key = Buffer.from(
		args.secret.startsWith("whsec_") ? args.secret.slice(6) : args.secret,
		"base64",
	);
	const expected = createHmac("sha256", key)
		.update(`${id}.${timestamp}.${args.body}`)
		.digest();
	return signature.split(" ").some((entry) => {
		const [version, value] = entry.split(",");
		if (version !== "v1" || !value) return false;
		const given = Buffer.from(value, "base64");
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
}
