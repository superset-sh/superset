import { randomUUID } from "node:crypto";
import {
	compareTopLevelItems,
	getFirstSectionIndex,
	getNextTabOrder,
	type TopLevelItem,
} from "@superset/shared/sidebar-order";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { HostDb } from "../db";
import { sidebarSections, workspaces } from "../db/schema";
import type { SidebarSectionSnapshot } from "../events/types";
import {
	getLocalWorkspace,
	type HostWorkspaceRow,
	toWorkspaceSnapshot,
	type WorkspaceStoreContext,
} from "./local-workspace-store";

export type SidebarSectionRow = typeof sidebarSections.$inferSelect;

export function toSectionSnapshot(
	row: SidebarSectionRow,
): SidebarSectionSnapshot {
	return {
		id: row.id,
		projectId: row.projectId,
		name: row.name,
		color: row.color,
		tabOrder: row.tabOrder,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export function listSections(
	db: HostDb,
	projectId?: string,
): SidebarSectionRow[] {
	return db
		.select()
		.from(sidebarSections)
		.where(projectId ? eq(sidebarSections.projectId, projectId) : undefined)
		.orderBy(asc(sidebarSections.tabOrder))
		.all();
}

export function getSection(
	db: HostDb,
	id: string,
): SidebarSectionRow | undefined {
	return db.query.sidebarSections
		.findFirst({ where: eq(sidebarSections.id, id) })
		.sync();
}

/**
 * This host's view of a project's top-level sidebar lane. Lane rewrites
 * renumber only this host's subset; merged client views re-sort by the
 * absolute tabOrder values.
 */
function getProjectTopLevelItems(
	db: HostDb,
	projectId: string,
	options: { excludeWorkspaceId?: string; excludeSectionId?: string } = {},
): TopLevelItem[] {
	const ungrouped = db
		.select()
		.from(workspaces)
		.where(
			and(eq(workspaces.projectId, projectId), isNull(workspaces.sectionId)),
		)
		.all()
		.filter((row) => row.id !== options.excludeWorkspaceId)
		.map((row) => ({
			type: "workspace" as const,
			id: row.id,
			tabOrder: row.tabOrder,
		}));
	const sections = listSections(db, projectId)
		.filter((row) => row.id !== options.excludeSectionId)
		.map((row) => ({
			type: "section" as const,
			id: row.id,
			tabOrder: row.tabOrder,
		}));
	return [...ungrouped, ...sections].sort(compareTopLevelItems);
}

function listSectionMembers(db: HostDb, sectionId: string): HostWorkspaceRow[] {
	return db
		.select()
		.from(workspaces)
		.where(eq(workspaces.sectionId, sectionId))
		.orderBy(asc(workspaces.tabOrder))
		.all();
}

/** This host's member workspace ids for a section (for membership checks). */
export function getSectionMemberIds(db: HostDb, sectionId: string): string[] {
	return db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(eq(workspaces.sectionId, sectionId))
		.all()
		.map((row) => row.id);
}

function emitSectionChanged(
	ctx: WorkspaceStoreContext,
	eventType: "created" | "updated" | "deleted",
): void {
	ctx.eventBus.broadcastSectionChanged({
		eventType,
		sections: listSections(ctx.db).map(toSectionSnapshot),
		occurredAt: Date.now(),
	});
}

function emitWorkspacesChanged(
	ctx: WorkspaceStoreContext,
	rows: HostWorkspaceRow[],
): void {
	const occurredAt = Date.now();
	for (const row of rows) {
		ctx.eventBus.broadcastWorkspaceChanged({
			workspaceId: row.id,
			eventType: "updated",
			workspace: toWorkspaceSnapshot(row),
			occurredAt,
		});
	}
}

// Patch a workspace row, read it back, broadcast the change.
function updateWorkspaceRow(
	ctx: WorkspaceStoreContext,
	workspaceId: string,
	patch: { sectionId: string | null; tabOrder: number },
): HostWorkspaceRow | undefined {
	ctx.db
		.update(workspaces)
		.set({ ...patch, updatedAt: Date.now() })
		.where(eq(workspaces.id, workspaceId))
		.run();
	const row = getLocalWorkspace(ctx.db, workspaceId);
	if (row) emitWorkspacesChanged(ctx, [row]);
	return row;
}

/**
 * Renumber the top-level lane to 1..n in one transaction (optionally deleting
 * a section in the same commit) and broadcast the touched workspaces. Lane
 * workspaces are always ungrouped. Returns whether the lane held any sections.
 */
function rewriteTopLevelLane(
	ctx: WorkspaceStoreContext,
	lane: TopLevelItem[],
	options: { deleteSectionId?: string } = {},
): { hasSections: boolean } {
	const now = Date.now();
	ctx.db.transaction((tx) => {
		lane.forEach((item, index) => {
			const tabOrder = index + 1;
			if (item.type === "workspace") {
				tx.update(workspaces)
					.set({ sectionId: null, tabOrder, updatedAt: now })
					.where(eq(workspaces.id, item.id))
					.run();
			} else {
				tx.update(sidebarSections)
					.set({ tabOrder, updatedAt: now })
					.where(eq(sidebarSections.id, item.id))
					.run();
			}
		});
		if (options.deleteSectionId) {
			tx.delete(sidebarSections)
				.where(eq(sidebarSections.id, options.deleteSectionId))
				.run();
		}
	});
	const touched = lane
		.filter((item) => item.type === "workspace")
		.map((item) => getLocalWorkspace(ctx.db, item.id))
		.filter((row): row is HostWorkspaceRow => row !== undefined);
	emitWorkspacesChanged(ctx, touched);
	return { hasSections: lane.some((item) => item.type === "section") };
}

export interface CreateSectionValues {
	id?: string;
	projectId: string;
	name: string;
	color?: string | null;
	tabOrder?: number;
}

/** Idempotent on `id`: creating an existing id returns the existing row. */
export function createSection(
	ctx: WorkspaceStoreContext,
	values: CreateSectionValues,
): SidebarSectionRow {
	if (values.id) {
		const existing = getSection(ctx.db, values.id);
		if (existing) return existing;
	}
	const id = values.id ?? randomUUID();
	const now = Date.now();
	ctx.db
		.insert(sidebarSections)
		.values({
			id,
			projectId: values.projectId,
			name: values.name,
			color: values.color ?? null,
			tabOrder:
				values.tabOrder ??
				getNextTabOrder(getProjectTopLevelItems(ctx.db, values.projectId)),
			createdAt: now,
			updatedAt: now,
		})
		.run();
	const row = getSection(ctx.db, id);
	if (!row) throw new Error(`Section insert readback failed: ${id}`);
	emitSectionChanged(ctx, "created");
	return row;
}

export interface UpdateSectionPatch {
	name?: string;
	color?: string | null;
}

export function updateSection(
	ctx: WorkspaceStoreContext,
	id: string,
	patch: UpdateSectionPatch,
): SidebarSectionRow | undefined {
	const existing = getSection(ctx.db, id);
	if (!existing) return undefined;
	ctx.db
		.update(sidebarSections)
		.set({ ...patch, updatedAt: Date.now() })
		.where(eq(sidebarSections.id, id))
		.run();
	const row = getSection(ctx.db, id);
	if (row) emitSectionChanged(ctx, "updated");
	return row;
}

/**
 * Un-groups this host's members into the top-level lane above the first
 * remaining section, then deletes the row. Members on other hosts reference
 * the id opaquely — their own clients clear it.
 */
export function deleteSection(ctx: WorkspaceStoreContext, id: string): boolean {
	const section = getSection(ctx.db, id);
	if (!section) return false;

	const members = listSectionMembers(ctx.db, id);
	const lane = getProjectTopLevelItems(ctx.db, section.projectId, {
		excludeSectionId: id,
	});
	const insertIndex = getFirstSectionIndex(lane);
	lane.splice(
		insertIndex,
		0,
		...members.map((member) => ({
			type: "workspace" as const,
			id: member.id,
			tabOrder: 0,
		})),
	);

	rewriteTopLevelLane(ctx, lane, { deleteSectionId: id });
	emitSectionChanged(ctx, "deleted");
	return true;
}

export interface MoveWorkspaceToSectionValues {
	workspaceId: string;
	/** Null = ungroup back to the project's top-level lane. */
	sectionId: string | null;
	/**
	 * Absolute placement, used verbatim when provided. Omitted: append within
	 * the section, or insert at the first-section boundary when un-grouping.
	 */
	tabOrder?: number;
}

export function moveWorkspaceToSection(
	ctx: WorkspaceStoreContext,
	values: MoveWorkspaceToSectionValues,
): HostWorkspaceRow | undefined {
	const workspace = getLocalWorkspace(ctx.db, values.workspaceId);
	if (!workspace) return undefined;

	// Absolute placement: write the caller's tabOrder verbatim.
	if (values.tabOrder !== undefined) {
		return updateWorkspaceRow(ctx, values.workspaceId, {
			sectionId: values.sectionId,
			tabOrder: values.tabOrder,
		});
	}

	// Grouping: append to the end of the target section's members.
	if (values.sectionId !== null) {
		const members = listSectionMembers(ctx.db, values.sectionId).filter(
			(row) => row.id !== values.workspaceId,
		);
		return updateWorkspaceRow(ctx, values.workspaceId, {
			sectionId: values.sectionId,
			tabOrder: getNextTabOrder(members),
		});
	}

	// Un-grouping: splice into the top-level lane at the first-section boundary
	// and renumber the whole lane.
	const lane = getProjectTopLevelItems(ctx.db, workspace.projectId, {
		excludeWorkspaceId: values.workspaceId,
	});
	const insertIndex = getFirstSectionIndex(lane);
	lane.splice(insertIndex, 0, {
		type: "workspace",
		id: values.workspaceId,
		tabOrder: 0,
	});
	const { hasSections } = rewriteTopLevelLane(ctx, lane);
	if (hasSections) emitSectionChanged(ctx, "updated");
	return getLocalWorkspace(ctx.db, values.workspaceId);
}

export function reorderSections(
	ctx: WorkspaceStoreContext,
	items: Array<{ id: string; tabOrder: number }>,
): void {
	const now = Date.now();
	ctx.db.transaction((tx) => {
		for (const item of items) {
			tx.update(sidebarSections)
				.set({ tabOrder: item.tabOrder, updatedAt: now })
				.where(eq(sidebarSections.id, item.id))
				.run();
		}
	});
	emitSectionChanged(ctx, "updated");
}

export function reorderWorkspacesInSection(
	ctx: WorkspaceStoreContext,
	sectionId: string,
	workspaceIds: string[],
): void {
	const now = Date.now();
	ctx.db.transaction((tx) => {
		workspaceIds.forEach((workspaceId, index) => {
			// Constrain to existing members so a stray id can't be relocated in.
			tx.update(workspaces)
				.set({ tabOrder: index + 1, updatedAt: now })
				.where(
					and(
						eq(workspaces.id, workspaceId),
						eq(workspaces.sectionId, sectionId),
					),
				)
				.run();
		});
	});
	const touched = workspaceIds
		.map((id) => getLocalWorkspace(ctx.db, id))
		.filter((row): row is HostWorkspaceRow => row !== undefined);
	emitWorkspacesChanged(ctx, touched);
}

export interface LaneWrites {
	sections?: Array<{ id: string; tabOrder: number }>;
	workspaces?: Array<{
		workspaceId: string;
		sectionId: string | null;
		tabOrder: number;
	}>;
}

/**
 * Apply section-order and workspace-placement writes for this host in a single
 * transaction (no half-applied reorder). Callers own validation.
 */
export function applyLaneWrites(
	ctx: WorkspaceStoreContext,
	writes: LaneWrites,
): void {
	const now = Date.now();
	ctx.db.transaction((tx) => {
		for (const section of writes.sections ?? []) {
			tx.update(sidebarSections)
				.set({ tabOrder: section.tabOrder, updatedAt: now })
				.where(eq(sidebarSections.id, section.id))
				.run();
		}
		for (const workspace of writes.workspaces ?? []) {
			tx.update(workspaces)
				.set({
					sectionId: workspace.sectionId,
					tabOrder: workspace.tabOrder,
					updatedAt: now,
				})
				.where(eq(workspaces.id, workspace.workspaceId))
				.run();
		}
	});
	const touched = (writes.workspaces ?? [])
		.map((write) => getLocalWorkspace(ctx.db, write.workspaceId))
		.filter((row): row is HostWorkspaceRow => row !== undefined);
	if (touched.length > 0) emitWorkspacesChanged(ctx, touched);
	if ((writes.sections ?? []).length > 0) emitSectionChanged(ctx, "updated");
}
