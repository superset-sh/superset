import {
	projectCollectionPendingDeletes,
	projectCollectionPendingPresentations,
	projectCollectionPlacements,
} from "@superset/local-db";
import { and, eq, inArray, isNull, like, notInArray, sql } from "drizzle-orm";
import type { LocalDb } from "main/lib/local-db";
import type {
	ProjectCollectionPendingDelete,
	ProjectCollectionPendingPresentation,
	ProjectCollectionPlacement,
} from "shared/project-collections";

export function projectCollectionPlacementStore(
	db: LocalDb,
	scope: { organizationId: string; userId: string },
) {
	const belongsToScope = () =>
		and(
			eq(projectCollectionPlacements.organizationId, scope.organizationId),
			eq(projectCollectionPlacements.userId, scope.userId),
		);
	const pendingScope = () =>
		and(
			eq(projectCollectionPendingDeletes.organizationId, scope.organizationId),
			eq(projectCollectionPendingDeletes.userId, scope.userId),
		);
	const presentationScope = () =>
		and(
			eq(
				projectCollectionPendingPresentations.organizationId,
				scope.organizationId,
			),
			eq(projectCollectionPendingPresentations.userId, scope.userId),
		);
	return {
		pendingPresentations: () =>
			db
				.select()
				.from(projectCollectionPendingPresentations)
				.where(presentationScope())
				.all(),
		acknowledgePresentations: (rows: ProjectCollectionPendingPresentation[]) =>
			db.transaction((tx) => {
				for (const row of rows)
					tx.delete(projectCollectionPendingPresentations)
						.where(
							and(
								presentationScope(),
								eq(
									projectCollectionPendingPresentations.machineId,
									row.machineId,
								),
								eq(projectCollectionPendingPresentations.tag, row.tag),
								eq(projectCollectionPendingPresentations.setting, row.setting),
							),
						)
						.run();
			}),
		pendingDeletes: () =>
			db
				.select()
				.from(projectCollectionPendingDeletes)
				.where(pendingScope())
				.all()
				.map(({ deletedAt, ...row }) => ({
					...row,
					...(deletedAt === null ? {} : { deletedAt }),
				})),
		acknowledgeDeletes: (rows: ProjectCollectionPendingDelete[]) =>
			db.transaction((tx) => {
				for (const row of rows)
					tx.delete(projectCollectionPendingDeletes)
						.where(
							and(
								pendingScope(),
								eq(projectCollectionPendingDeletes.machineId, row.machineId),
								eq(projectCollectionPendingDeletes.tag, row.tag),
								row.deletedAt === undefined
									? isNull(projectCollectionPendingDeletes.deletedAt)
									: eq(
											projectCollectionPendingDeletes.deletedAt,
											row.deletedAt,
										),
							),
						)
						.run();
			}),
		list: () =>
			db
				.select()
				.from(projectCollectionPlacements)
				.where(belongsToScope())
				.all(),
		write: (
			rows: ProjectCollectionPlacement[],
			removeKeys: string[],
			pendingDeletes: ProjectCollectionPendingDelete[] = [],
			removePendingDeleteTags: string[] = [],
			pendingPresentations: ProjectCollectionPendingPresentation[] = [],
			clearPendingSettings: ProjectCollectionPendingDelete[] = [],
		) =>
			db.transaction((tx) => {
				tx.delete(projectCollectionPlacements)
					.where(
						and(
							belongsToScope(),
							like(projectCollectionPlacements.key, "rail:%"),
						),
					)
					.run();
				if (removePendingDeleteTags.length)
					tx.delete(projectCollectionPendingDeletes)
						.where(
							and(
								pendingScope(),
								inArray(
									projectCollectionPendingDeletes.tag,
									removePendingDeleteTags,
								),
							),
						)
						.run();
				const deletePending = (
					table:
						| typeof projectCollectionPendingDeletes
						| typeof projectCollectionPendingPresentations,
					row: Pick<ProjectCollectionPendingDelete, "machineId" | "tag">,
				) =>
					tx
						.delete(table)
						.where(
							and(
								eq(table.organizationId, scope.organizationId),
								eq(table.userId, scope.userId),
								eq(table.machineId, row.machineId),
								eq(table.tag, row.tag),
							),
						)
						.run();
				for (const row of clearPendingSettings) {
					deletePending(projectCollectionPendingDeletes, row);
					deletePending(projectCollectionPendingPresentations, row);
				}
				for (const row of pendingDeletes) {
					deletePending(projectCollectionPendingPresentations, row);
					tx.insert(projectCollectionPendingDeletes)
						.values({ ...scope, ...row })
						.onConflictDoUpdate({
							target: [
								projectCollectionPendingDeletes.organizationId,
								projectCollectionPendingDeletes.userId,
								projectCollectionPendingDeletes.machineId,
								projectCollectionPendingDeletes.tag,
							],
							set: { deletedAt: row.deletedAt ?? null },
						})
						.run();
				}
				for (const row of pendingPresentations) {
					deletePending(projectCollectionPendingDeletes, row);
					deletePending(projectCollectionPendingPresentations, row);
					tx.insert(projectCollectionPendingPresentations)
						.values({ ...scope, ...row })
						.run();
				}
				for (const table of [
					projectCollectionPendingDeletes,
					projectCollectionPendingPresentations,
				]) {
					const pending = tx
						.select()
						.from(table)
						.where(
							and(
								eq(table.organizationId, scope.organizationId),
								eq(table.userId, scope.userId),
							),
						)
						.orderBy(sql`rowid DESC`)
						.all();
					const counts = new Map<string, number>();
					for (const row of pending) {
						const count = (counts.get(row.machineId) ?? 0) + 1;
						if (count > 128) deletePending(table, row);
						counts.set(row.machineId, count);
					}
				}

				if (removeKeys.length)
					tx.delete(projectCollectionPlacements)
						.where(
							and(
								belongsToScope(),
								inArray(projectCollectionPlacements.key, removeKeys),
							),
						)
						.run();
				for (const row of rows.filter((row) => !row.key.startsWith("rail:")))
					tx.insert(projectCollectionPlacements)
						.values({ ...scope, ...row })
						.onConflictDoUpdate({
							target: [
								projectCollectionPlacements.organizationId,
								projectCollectionPlacements.userId,
								projectCollectionPlacements.key,
							],
							set: row,
						})
						.run();
			}),
		reconcile: (keys: string[]) =>
			db
				.delete(projectCollectionPlacements)
				.where(
					and(
						belongsToScope(),
						keys.length
							? notInArray(projectCollectionPlacements.key, keys)
							: undefined,
					),
				)
				.run(),
	};
}
