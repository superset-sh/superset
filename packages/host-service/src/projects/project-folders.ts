import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projectFolders, projects } from "../db/schema";

export interface ProjectFolder {
	/** Null for the synthesized primary of a project with no rows yet. */
	id: string | null;
	projectId: string;
	position: number;
	folder: string;
	repoPath: string | null;
	repoUrl: string | null;
	baseBranch: string | null;
}

const MAX_FOLDER_NAME_LENGTH = 64;

/**
 * A folder name becomes a directory inside the workspace container, so it
 * must be a single path segment with nothing a shell or a path join could
 * reinterpret. Null when the input cannot be one.
 */
export function sanitizeFolderName(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed || trimmed.length > MAX_FOLDER_NAME_LENGTH) return null;
	return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed) ? trimmed : null;
}

/** "api", then "api-2", "api-3", … against the names already in use. */
export function deduplicateFolderName(
	candidate: string,
	taken: Iterable<string>,
): string {
	const used = new Set([...taken].map((name) => name.toLowerCase()));
	if (!used.has(candidate.toLowerCase())) return candidate;
	for (let suffix = 2; ; suffix++) {
		const next = `${candidate}-${suffix}`;
		if (!used.has(next.toLowerCase())) return next;
	}
}

export function defaultFolderNameForRepo(repoPath: string): string {
	const slug = basename(repoPath)
		.trim()
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/^[^A-Za-z0-9]+/, "")
		.slice(0, MAX_FOLDER_NAME_LENGTH);
	return sanitizeFolderName(slug) ?? "repo";
}

/**
 * The project's folders in position order. A project with no rows yet reads
 * as the single primary its `repo_path` already describes.
 */
export function listProjectFolders(
	db: HostDb,
	projectId: string,
): ProjectFolder[] {
	const rows = db
		.select()
		.from(projectFolders)
		.where(eq(projectFolders.projectId, projectId))
		.all()
		.sort((a, b) => a.position - b.position);
	if (rows.length > 0) {
		return rows.map((row) => ({
			id: row.id,
			projectId: row.projectId,
			position: row.position,
			folder: row.folder,
			repoPath: row.repoPath,
			repoUrl: row.repoUrl,
			baseBranch: row.baseBranch,
		}));
	}

	const project = db
		.select({ repoPath: projects.repoPath, repoUrl: projects.repoUrl })
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();
	if (!project) return [];
	return [
		{
			id: null,
			projectId,
			position: 0,
			folder: defaultFolderNameForRepo(project.repoPath),
			repoPath: project.repoPath,
			repoUrl: project.repoUrl,
			baseBranch: null,
		},
	];
}

/** Idempotent: gives a project that predates the table a real row to order. */
export function ensurePrimaryProjectFolder(
	db: HostDb,
	projectId: string,
): ProjectFolder[] {
	const existing = listProjectFolders(db, projectId);
	if (existing.length === 0) return existing;
	if (existing[0]?.id !== null) return existing;

	const now = Date.now();
	db.insert(projectFolders)
		.values(
			existing.map((folder) => ({
				id: randomUUID(),
				projectId,
				position: folder.position,
				folder: folder.folder,
				repoPath: folder.repoPath,
				repoUrl: folder.repoUrl,
				baseBranch: folder.baseBranch,
				createdAt: now,
				updatedAt: now,
			})),
		)
		.onConflictDoNothing()
		.run();
	return listProjectFolders(db, projectId);
}

/**
 * Rewrite positions to 0..n-1 in the given order. SQLite enforces
 * `unique(project_id, position)` per statement, so the rows are parked on
 * negative positions first — a straight renumber collides mid-flight.
 */
export function reassignFolderPositions(
	db: HostDb,
	_projectId: string,
	orderedFolderIds: string[],
): void {
	const now = Date.now();
	db.transaction((tx) => {
		orderedFolderIds.forEach((id, index) => {
			tx.update(projectFolders)
				.set({ position: -(index + 1), updatedAt: now })
				.where(eq(projectFolders.id, id))
				.run();
		});
		orderedFolderIds.forEach((id, index) => {
			tx.update(projectFolders)
				.set({ position: index, updatedAt: now })
				.where(eq(projectFolders.id, id))
				.run();
		});
	});
}
