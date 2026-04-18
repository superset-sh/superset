import { db } from "@superset/db/client";
import { referrals } from "@superset/db/schema";
import { members, organizations } from "@superset/db/schema/auth";
import { eq } from "drizzle-orm";
import { captureReferralEvent } from "./referral-analytics";

const ATTRIBUTION_WINDOW_MS = 5 * 60 * 1000;

export const REFERRAL_COOKIE_NAME = "superset_referral";

export type AttributeReferralResult =
	| { status: "attributed"; referrerOrganizationId: string }
	| { status: "rejected"; reason: AttributionRejectionReason };

export type AttributionRejectionReason =
	| "no-code"
	| "user-not-new"
	| "unknown-code"
	| "self-referral"
	| "already-attributed";

export async function attributeReferral({
	refereeUser,
	code,
}: {
	refereeUser: { id: string; createdAt: Date };
	code: string | null | undefined;
}): Promise<AttributeReferralResult> {
	const reject = (reason: AttributionRejectionReason) => {
		if (reason !== "no-code") {
			captureReferralEvent({
				name: "referral_rejected",
				distinctId: refereeUser.id,
				properties: { referee_user_id: refereeUser.id, reason },
			});
		}
		return { status: "rejected" as const, reason };
	};

	if (!code) return reject("no-code");

	if (Date.now() - refereeUser.createdAt.getTime() > ATTRIBUTION_WINDOW_MS) {
		return reject("user-not-new");
	}

	const referrerOrganization = await db.query.organizations.findFirst({
		where: eq(organizations.referralCode, code),
	});
	if (!referrerOrganization) {
		return reject("unknown-code");
	}

	const existingMemberships = await db.query.members.findMany({
		where: eq(members.userId, refereeUser.id),
		columns: { organizationId: true },
	});
	if (
		existingMemberships.some(
			(m) => m.organizationId === referrerOrganization.id,
		)
	) {
		return reject("self-referral");
	}

	const inserted = await db
		.insert(referrals)
		.values({
			referrerOrganizationId: referrerOrganization.id,
			refereeUserId: refereeUser.id,
		})
		.onConflictDoNothing()
		.returning({ id: referrals.id });

	if (inserted.length === 0) {
		return reject("already-attributed");
	}

	captureReferralEvent({
		name: "referral_signup_attributed",
		distinctId: refereeUser.id,
		properties: {
			referee_user_id: refereeUser.id,
			referrer_organization_id: referrerOrganization.id,
		},
	});

	return {
		status: "attributed",
		referrerOrganizationId: referrerOrganization.id,
	};
}

export function parseReferralCookie(cookieHeader: string | null | undefined) {
	if (!cookieHeader) return null;
	const match = cookieHeader.match(
		new RegExp(`${REFERRAL_COOKIE_NAME}=([^;]+)`),
	);
	if (!match?.[1]) return null;
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return null;
	}
}
