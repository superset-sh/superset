import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";

type List = "active" | "archived";

const pending = new Map<string, { to: List; row: CloudWorkspaceRow }>();

export function beginCloudMove(to: List, row: CloudWorkspaceRow): void {
	pending.set(row.id, { to, row });
}

export function endCloudMove(id: string): void {
	pending.delete(id);
}

/**
 * A list fetched while an archive or unarchive is in flight still has the row
 * where it was; keep it where the user just moved it until the request settles.
 */
export function withPendingCloudMoves(
	list: List,
	rows: CloudWorkspaceRow[],
): CloudWorkspaceRow[] {
	if (pending.size === 0) return rows;
	const kept = rows.filter((row) => {
		const move = pending.get(row.id);
		return !move || move.to === list;
	});
	for (const [id, move] of pending) {
		if (move.to === list && !kept.some((row) => row.id === id)) {
			kept.unshift(move.row);
		}
	}
	return kept;
}
