import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { eq, notExists, sql } from "drizzle-orm";
import type { HostDb } from "../db";
import {
	projectFolders,
	projectGroupMembers,
	projectGroups,
	projects,
} from "../db/schema";
import { defaultFolderNameForRepo } from "../projects/project-folders";

export interface ProjectGroupBackfillContext {
	db: HostDb;
}

export interface ProjectGroupBackfillResult {
	groups: number;
	members: number;
}

interface MemberValues {
	id: string;
	groupId: string;
	projectId: string;
	position: number;
	folder: string;
	baseBranch: string | null;
	createdAt: number;
}

export function runProjectGroupBackfill(
	ctx: ProjectGroupBackfillContext,
): ProjectGroupBackfillResult {
	const { db } = ctx;

	const ungroupedProjects = db
		.select({
			id: projects.id,
			name: projects.name,
			repoPath: projects.repoPath,
			icon: projects.icon,
			color: projects.color,
		})
		.from(projects)
		.where(
			notExists(
				db
					.select({ one: sql`1` })
					.from(projectGroupMembers)
					.where(eq(projectGroupMembers.projectId, projects.id)),
			),
		)
		.all();

	if (ungroupedProjects.length === 0) return { groups: 0, members: 0 };

	const now = Date.now();
	const projectIdByRepoPath = new Map(
		db
			.select({ id: projects.id, repoPath: projects.repoPath })
			.from(projects)
			.all()
			.map((row) => [row.repoPath, row.id]),
	);
	const foldersByProject = new Map<
		string,
		{
			position: number;
			folder: string;
			repoPath: string | null;
			baseBranch: string | null;
		}[]
	>();
	for (const row of db.select().from(projectFolders).all()) {
		const folders = foldersByProject.get(row.projectId) ?? [];
		folders.push({
			position: row.position,
			folder: row.folder,
			repoPath: row.repoPath,
			baseBranch: row.baseBranch,
		});
		foldersByProject.set(row.projectId, folders);
	}

	let members = 0;
	db.transaction((tx) => {
		for (const project of ungroupedProjects) {
			const groupId = randomUUID();
			tx.insert(projectGroups)
				.values({
					id: groupId,
					name: project.name || basename(project.repoPath),
					icon: project.icon,
					color: project.color,
					createdAt: now,
					updatedAt: now,
				})
				.run();

			const values: MemberValues[] = [];
			const claimedProjectIds = new Set<string>();
			for (const folder of (foldersByProject.get(project.id) ?? []).sort(
				(a, b) => a.position - b.position,
			)) {
				const memberProjectId =
					folder.position === 0
						? project.id
						: folder.repoPath
							? projectIdByRepoPath.get(folder.repoPath)
							: undefined;
				if (!memberProjectId || claimedProjectIds.has(memberProjectId))
					continue;
				claimedProjectIds.add(memberProjectId);
				values.push({
					id: randomUUID(),
					groupId,
					projectId: memberProjectId,
					position: values.length,
					folder: folder.folder,
					baseBranch: folder.baseBranch,
					createdAt: now,
				});
			}
			if (values.length === 0) {
				values.push({
					id: randomUUID(),
					groupId,
					projectId: project.id,
					position: 0,
					folder: defaultFolderNameForRepo(project.repoPath),
					baseBranch: null,
					createdAt: now,
				});
			}

			tx.insert(projectGroupMembers).values(values).onConflictDoNothing().run();
			members += values.length;
		}
	});

	return { groups: ungroupedProjects.length, members };
}
