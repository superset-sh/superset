export interface DeletedProjectRow {
	id: string;
	name: string;
	deletedAt: number;
	deletedByUserId: string | null;
	purgeAt: number;
}

export interface DeletedProject extends DeletedProjectRow {
	hosts: { hostId: string; url: string }[];
}

/** One entry per project, across every device that holds a deleted copy. */
export function mergeDeletedProjects(
	perHost: { hostId: string; url: string; rows: DeletedProjectRow[] }[],
): DeletedProject[] {
	const byId = new Map<string, DeletedProject>();
	for (const { hostId, url, rows } of perHost) {
		for (const row of rows) {
			const existing = byId.get(row.id);
			if (!existing) {
				byId.set(row.id, { ...row, hosts: [{ hostId, url }] });
				continue;
			}
			existing.hosts.push({ hostId, url });
			if (row.deletedAt > existing.deletedAt) {
				existing.deletedAt = row.deletedAt;
				existing.deletedByUserId = row.deletedByUserId;
			}
			existing.purgeAt = Math.min(existing.purgeAt, row.purgeAt);
		}
	}
	return [...byId.values()].sort((a, b) => b.deletedAt - a.deletedAt);
}
