import crypto from "node:crypto";
import { db } from "@superset/db/client";
import { verifications } from "@superset/db/schema/auth";

export async function generateMagicTokenForInvite({
	invitationId,
}: {
	invitationId: string;
}): Promise<string> {
	// Generate cryptographically secure token (64 hex characters)
	const token = crypto.randomBytes(32).toString("hex");

	// 1 week expiry (matches invitation expiry)
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	// Insert into verifications table. New invitation links are keyed to a
	// specific invitation id rather than just the invitee email.
	await db.insert(verifications).values({
		identifier: invitationId,
		value: token,
		expiresAt,
	});

	return token;
}
