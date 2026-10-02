import type { CloudWorkspaceRow } from "./useCloudWorkspaces";

const asDate = <Value extends Date | null>(value: Value): Value =>
	(value === null || value instanceof Date
		? value
		: new Date(value as unknown as string)) as Value;

/**
 * The persisted query cache stores rows as JSON, so a cold start hands back
 * strings where the API sent dates; every date field is a Date again after this.
 */
export function reviveCloudWorkspaceRow(
	row: CloudWorkspaceRow,
): CloudWorkspaceRow {
	return {
		...row,
		createdAt: asDate(row.createdAt),
		updatedAt: asDate(row.updatedAt),
		deletedAt: asDate(row.deletedAt),
		agentStatusAt: asDate(row.agentStatusAt),
		presence: row.presence.map((person) => ({
			...person,
			lastSeenAt: asDate(person.lastSeenAt),
		})),
	};
}

export const reviveCloudWorkspaceRows = (rows: CloudWorkspaceRow[]) =>
	rows.map(reviveCloudWorkspaceRow);
