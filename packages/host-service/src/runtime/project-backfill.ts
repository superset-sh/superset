import { basename } from "node:path";
import { and, eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects } from "../db/schema";
import type { EventBus } from "../events";
import {
	emitProjectChanged,
	getLocalProject,
} from "../projects/local-project-store";

export interface ProjectBackfillContext {
	db: HostDb;
	eventBus: EventBus;
}

/**
 * One-time-per-row backfill of `name` for rows that predate host ownership.
 * Targets rows with the empty-name sentinel; steady-state boots are a single
 * indexed query. The folder basename is the name — the repo on disk is the
 * truth for both existence and identity.
 */
export async function runProjectBackfill(
	ctx: ProjectBackfillContext,
): Promise<void> {
	const pending = ctx.db
		.select()
		.from(projects)
		.where(eq(projects.name, ""))
		.all();
	if (pending.length === 0) return;

	let filled = 0;
	for (const row of pending) {
		// CAS on the empty-name sentinel: a rename that landed since the
		// select must not be clobbered by a stale name.
		const result = ctx.db
			.update(projects)
			.set({ name: basename(row.repoPath), updatedAt: Date.now() })
			.where(and(eq(projects.id, row.id), eq(projects.name, "")))
			.run();
		if (result.changes === 0) continue;
		const updated = getLocalProject(ctx.db, row.id);
		if (updated) emitProjectChanged(ctx.eventBus, "updated", updated);
		filled++;
	}
	console.log(`[project-backfill] backfilled ${filled} row(s)`);
}
