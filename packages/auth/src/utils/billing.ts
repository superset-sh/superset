import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { and, eq } from "drizzle-orm";

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

export function formatPrice(amountInCents: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountInCents / 100);
}
