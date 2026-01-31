import crypto from "node:crypto";
import { db } from "@superset/db/client";
import { verifications } from "@superset/db/schema/auth";

export async function generateMagicTokenForInvite({
	email,
}: {
	email: string;
}): Promise<string> {
	// Generate cryptographically secure token (64 hex characters)
	const token = crypto.randomBytes(32).toString("hex");

	// 1 week expiry (matches invitation expiry)
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	// Insert into verifications table
	// identifier = email, value = token
	await db.insert(verifications).values({
		identifier: email,
		value: token,
		expiresAt,
	});

	return token;
}
