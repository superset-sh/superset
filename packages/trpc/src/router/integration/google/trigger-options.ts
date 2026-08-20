import { db } from "@superset/db/client";
import { userIdentities, users } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import type { TriggerOptionSource } from "../trigger-options";
import { listCalendars as listGoogleCalendars } from "./calendar";
import { listLabels as listGmailLabels } from "./gmail";
import { findGoogleConnection } from "./state";

/**
 * Google is connected per member, so every list here is the asking user's
 * own account: another member's calendars are not theirs to pick from.
 */

const calendars: TriggerOptionSource = async ({ organizationId, userId }) => {
	const connection = await findGoogleConnection(organizationId, userId);
	if (!connection) return [];
	const list = await listGoogleCalendars(connection.id);
	return list
		.filter((calendar) => !calendar.deleted)
		.map((calendar) => ({
			id: calendar.id,
			label: calendar.primary
				? `${calendar.summary ?? calendar.id} (primary)`
				: (calendar.summary ?? calendar.id),
		}));
};

/** The mailbox's labels. Ids, since names can be renamed. */
const labels: TriggerOptionSource = async ({ organizationId, userId }) => {
	const connection = await findGoogleConnection(organizationId, userId);
	if (!connection) return [];
	const list = await listGmailLabels(connection.id);
	return (
		list
			// Gmail's internal category and chat labels are noise in a picker.
			.filter((label) => !label.id.startsWith("CATEGORY_"))
			.map((label) => ({ id: label.id, label: label.name }))
	);
};

/**
 * People an attendee filter can name, as Google addresses: org members who
 * have connected or linked a Google account. The id is the address because
 * that is what a calendar event names people by.
 */
const people: TriggerOptionSource = async ({ organizationId }) => {
	const rows = await db
		.select({ email: userIdentities.externalId, name: users.name })
		.from(userIdentities)
		.innerJoin(users, eq(users.id, userIdentities.userId))
		.where(
			and(
				eq(userIdentities.organizationId, organizationId),
				eq(userIdentities.provider, "google"),
			),
		);
	return rows.map((row) => ({
		id: row.email.toLowerCase(),
		label: row.name ? `${row.name} (${row.email})` : row.email,
	}));
};

export const googleTriggerOptions = { calendars, labels, people };
