import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projectGroupMembers, projectGroups } from "../db/schema";

export interface ProjectGroupMember {
	id: string;
	groupId: string;
	projectId: string;
	position: number;
	folder: string;
	baseBranch: string | null;
}

export interface ProjectGroup {
	id: string;
	name: string;
	icon: string | null;
	color: string | null;
	createdAt: number;
	updatedAt: number;
	members: ProjectGroupMember[];
}

function byPosition(a: ProjectGroupMember, b: ProjectGroupMember): number {
	return a.position - b.position;
}

export function listProjectGroupMembers(
	db: HostDb,
	groupId: string,
): ProjectGroupMember[] {
	return db
		.select()
		.from(projectGroupMembers)
		.where(eq(projectGroupMembers.groupId, groupId))
		.all()
		.map((row) => ({
			id: row.id,
			groupId: row.groupId,
			projectId: row.projectId,
			position: row.position,
			folder: row.folder,
			baseBranch: row.baseBranch,
		}))
		.sort(byPosition);
}

export function getProjectGroup(
	db: HostDb,
	groupId: string,
): ProjectGroup | null {
	const row = db
		.select()
		.from(projectGroups)
		.where(eq(projectGroups.id, groupId))
		.get();
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		icon: row.icon,
		color: row.color,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		members: listProjectGroupMembers(db, groupId),
	};
}

export function listProjectGroups(db: HostDb): ProjectGroup[] {
	const membersByGroup = new Map<string, ProjectGroupMember[]>();
	for (const row of db.select().from(projectGroupMembers).all()) {
		const members = membersByGroup.get(row.groupId) ?? [];
		members.push({
			id: row.id,
			groupId: row.groupId,
			projectId: row.projectId,
			position: row.position,
			folder: row.folder,
			baseBranch: row.baseBranch,
		});
		membersByGroup.set(row.groupId, members);
	}
	return db
		.select()
		.from(projectGroups)
		.all()
		.map((row) => ({
			id: row.id,
			name: row.name,
			icon: row.icon,
			color: row.color,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			members: (membersByGroup.get(row.id) ?? []).sort(byPosition),
		}))
		.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * A repository adopted as another project's first source folder is the
 * primary of both that group and its own backfilled one, so the group that
 * owns several folders wins — the renderer's
 * `indexProjectGroupsByPrimaryProjectId` resolves the same way, so the name
 * shown is the name whose folders get checked out.
 */
export function findGroupForPrimaryProject(
	db: HostDb,
	projectId: string,
): ProjectGroup | null {
	let claimed: ProjectGroup | null = null;
	for (const group of listProjectGroups(db)) {
		const primary = group.members.find((member) => member.position === 0);
		if (primary?.projectId !== projectId) continue;
		if (claimed && claimed.members.length >= group.members.length) continue;
		claimed = group;
	}
	return claimed;
}

export function reassignMemberPositions(
	db: HostDb,
	orderedMemberIds: string[],
): void {
	const positionParkedOutsideTheUniqueRange = (index: number) => -(index + 1);
	db.transaction((tx) => {
		orderedMemberIds.forEach((id, index) => {
			tx.update(projectGroupMembers)
				.set({ position: positionParkedOutsideTheUniqueRange(index) })
				.where(eq(projectGroupMembers.id, id))
				.run();
		});
		orderedMemberIds.forEach((id, index) => {
			tx.update(projectGroupMembers)
				.set({ position: index })
				.where(eq(projectGroupMembers.id, id))
				.run();
		});
	});
}
