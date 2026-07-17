import { basename } from "node:path";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects } from "../db/schema";
import type { EventBus } from "../events";
import {
	emitProjectChanged,
	getLocalProject,
} from "../projects/local-project-store";
import type { ApiClient } from "../types";

export interface ProjectBackfillContext {
	api: ApiClient;
	db: HostDb;
	eventBus: EventBus;
	organizationId: string;
}

/**
 * One-time-per-row backfill of `name` for rows that predate host ownership.
 * Targets rows with the empty-name sentinel; steady-state boots are a single
 * indexed query and no cloud calls. Same rules as workspace-backfill:
 *
 * - Legacy cloud row found → copy its name (that's where names lived before
 *   projects went local-first).
 * - Cloud row NOT_FOUND    → name from the folder basename. Never delete —
 *   the repo on disk is the truth for existence.
 * - Cloud unreachable      → leave the sentinel; retried next boot.
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
		let name: string;
		try {
			const cloud = await ctx.api.v2Project.get.query({
				organizationId: ctx.organizationId,
				id: row.id,
			});
			name = cloud.name;
		} catch (err) {
			const code =
				typeof err === "object" && err !== null
					? ((err as { data?: { code?: string } }).data?.code ?? null)
					: null;
			if (code !== "NOT_FOUND") {
				// Skip rather than abort: one row with a persistent cloud error
				// must not starve the rest of the sweep. Retried next boot.
				console.warn(
					"[project-backfill] cloud lookup failed; retrying next boot",
					{ projectId: row.id, err },
				);
				continue;
			}
			name = basename(row.repoPath);
		}

		ctx.db
			.update(projects)
			.set({ name, updatedAt: Date.now() })
			.where(eq(projects.id, row.id))
			.run();
		const updated = getLocalProject(ctx.db, row.id);
		if (updated) emitProjectChanged(ctx.eventBus, "updated", updated);
		filled++;
	}
	console.log(`[project-backfill] backfilled ${filled} row(s)`);
}
