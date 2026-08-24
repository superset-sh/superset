import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { and, count, eq, inArray, isNull } from "drizzle-orm";

/**
 * Roles that can act on a billing problem. Owners alone is too narrow: the
 * person holding the card is often an admin, and a payment-failure notice that
 * never reaches them is a notice nobody can act on.
 */
const BILLING_ROLES = ["owner", "admin"];

export async function getOrganizationOwners(organizationId: string) {
	return db
		.select({
			id: authSchema.users.id,
			name: authSchema.users.name,
			email: authSchema.users.email,
		})
		.from(members)
		.innerJoin(authSchema.users, eq(members.userId, authSchema.users.id))
		.where(
			and(
				eq(members.organizationId, organizationId),
				eq(members.role, "owner"),
			),
		);
}

/**
 * Everyone who should hear about a billing change: owners and admins.
 *
 * Returns the role too. Admins are told what happened, but anything that
 * grants billing control — a Stripe portal session, which is a bearer link —
 * stays with owners, because `requireOwnerWithCustomer` denies admins exactly
 * that in the app.
 */
export async function getOrganizationBillingRecipients(organizationId: string) {
	return db
		.select({
			id: authSchema.users.id,
			name: authSchema.users.name,
			email: authSchema.users.email,
			role: members.role,
		})
		.from(members)
		.innerJoin(authSchema.users, eq(members.userId, authSchema.users.id))
		.where(
			and(
				eq(members.organizationId, organizationId),
				inArray(members.role, BILLING_ROLES),
				isNull(authSchema.users.deletionRequestedAt),
			),
		);
}

/**
 * Seats we charge for.
 *
 * Members whose user has requested deletion are excluded, because that is the
 * same list the customer sees in the members UI. Counting every `members` row
 * instead bills for people the organization can no longer see.
 */
export async function countBillableSeats(
	organizationId: string,
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(members)
		.innerJoin(authSchema.users, eq(members.userId, authSchema.users.id))
		.where(
			and(
				eq(members.organizationId, organizationId),
				isNull(authSchema.users.deletionRequestedAt),
			),
		);

	return row?.count ?? 0;
}

export function formatPrice(amountInCents: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountInCents / 100);
}
