import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projectFolders, projects } from "../../../../../db/schema";
import {
	deduplicateFolderName,
	defaultFolderNameForRepo,
	listProjectFolders,
	type ProjectFolder,
	sanitizeFolderName,
} from "../../../../../projects/project-folders";
import {
	findGroupForPrimaryProject,
	type ProjectGroup,
} from "../../../../../projects/project-groups";
import type { HostServiceContext } from "../../../../../types";
import { persistLocalProject } from "../../../project/utils/persist-project";
import {
	cloneRepoInto,
	resolveLocalRepo,
} from "../../../project/utils/resolve-repo";
import { parseSparseCheckoutPaths } from "../sparse-checkout";

export function managedReposRoot(): string {
	return join(homedir(), ".superset", "repos");
}

export interface ResolvedFolder {
	position: number;
	folder: string;
	projectId: string;
	repoPath: string;
	baseBranch: string | null;
	sparsePaths: string[];
}

export type ProgressReporter = (line: string) => void;

type EffectiveFolder = ProjectFolder & { linkedProjectId: string | null };

/**
 * The project's own folders, the source folders of the Project it is the
 * primary of, then one per extra project id. Neither the group membership
 * nor the extra ids mutate the project's folder list.
 */
export function effectiveProjectFolders(
	ctx: HostServiceContext,
	projectId: string,
	extraProjectIds: string[] | undefined,
): EffectiveFolder[] {
	const base = listProjectFolders(ctx.db, projectId).map((folder) => ({
		...folder,
		linkedProjectId: folder.position === 0 ? projectId : null,
	}));
	const group = findGroupForPrimaryProject(ctx.db, projectId);
	const primary = base[0];
	const primaryFolder = group?.members.find((member) => member.position === 0);
	// Settings name the primary checkout after its membership row, so the
	// directory has to be the one they name.
	if (group && group.members.length > 1 && primary && primaryFolder) {
		base[0] = { ...primary, folder: primaryFolder.folder };
	}
	const folders = [...base, ...groupSourceFolders(group, ctx, projectId, base)];
	if (!extraProjectIds?.length) return folders;

	const taken = folders.map((folder) => folder.folder);
	const extras = extraProjectIds.map((extraId, index) => {
		const project = ctx.db
			.select()
			.from(projects)
			.where(eq(projects.id, extraId))
			.get();
		if (!project) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Project is not set up on this host: ${extraId}`,
			});
		}
		const folder = deduplicateFolderName(
			defaultFolderNameForRepo(project.repoPath),
			taken,
		);
		taken.push(folder);
		return {
			id: null,
			projectId,
			position: folders.length + index,
			folder,
			repoPath: project.repoPath,
			repoUrl: project.repoUrl,
			baseBranch: null,
			linkedProjectId: extraId,
		};
	});
	return [...folders, ...extras];
}

function groupSourceFolders(
	group: ProjectGroup | null,
	ctx: HostServiceContext,
	projectId: string,
	base: EffectiveFolder[],
): EffectiveFolder[] {
	if (!group) return [];

	const taken = base.map((folder) => folder.folder);
	const checkedOut = new Set(
		base.flatMap((folder) => (folder.repoPath ? [folder.repoPath] : [])),
	);
	const folders: EffectiveFolder[] = [];
	for (const member of group.members) {
		if (member.projectId === projectId) continue;
		const project = ctx.db
			.select()
			.from(projects)
			.where(eq(projects.id, member.projectId))
			.get();
		if (!project) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Source folder "${member.folder}" is not set up on this host`,
			});
		}
		if (checkedOut.has(project.repoPath)) continue;
		const folder = deduplicateFolderName(
			sanitizeFolderName(member.folder) ??
				defaultFolderNameForRepo(project.repoPath),
			taken,
		);
		taken.push(folder);
		checkedOut.add(project.repoPath);
		folders.push({
			id: null,
			projectId,
			position: base.length + folders.length,
			folder,
			repoPath: project.repoPath,
			repoUrl: project.repoUrl,
			baseBranch: member.baseBranch,
			linkedProjectId: member.projectId,
		});
	}
	return folders;
}

function isDirectory(path: string): boolean {
	return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
}

function findProjectByRepoPath(
	ctx: HostServiceContext,
	repoPath: string,
): string | null {
	return (
		ctx.db
			.select({ id: projects.id })
			.from(projects)
			.where(eq(projects.repoPath, repoPath))
			.get()?.id ?? null
	);
}

function findProjectByRepoUrl(
	ctx: HostServiceContext,
	repoUrl: string,
): { id: string; repoPath: string } | null {
	const target = repoUrl.toLowerCase();
	const match = ctx.db
		.select({
			id: projects.id,
			repoPath: projects.repoPath,
			url: projects.repoUrl,
		})
		.from(projects)
		.all()
		.find(
			(row) => row.url?.toLowerCase() === target && isDirectory(row.repoPath),
		);
	return match ? { id: match.id, repoPath: match.repoPath } : null;
}

async function adoptCheckout(
	ctx: HostServiceContext,
	repoPath: string,
): Promise<string> {
	const existing = findProjectByRepoPath(ctx, repoPath);
	if (existing) return existing;
	const resolved = await resolveLocalRepo(repoPath);
	const owner = findProjectByRepoPath(ctx, resolved.repoPath);
	if (owner) return owner;
	const id = randomUUID();
	persistLocalProject(ctx, id, resolved);
	return id;
}

/**
 * Give every folder a checkout on this host and the local project that owns
 * it.
 */
export async function resolveFolderProjects(args: {
	ctx: HostServiceContext;
	folders: Array<ProjectFolder & { linkedProjectId: string | null }>;
	onProgress: ProgressReporter;
}): Promise<ResolvedFolder[]> {
	const { ctx, folders, onProgress } = args;
	const resolved: ResolvedFolder[] = [];
	const projectIdByFolder = new Map<string, string>();

	for (const folder of folders) {
		const projectId = await resolveOneFolder(ctx, folder, onProgress);
		const clash = [...projectIdByFolder.entries()].find(
			([, id]) => id === projectId,
		);
		if (clash) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Folders "${clash[0]}" and "${folder.folder}" resolve to the same repository — a workspace can only check out each repository once`,
			});
		}
		projectIdByFolder.set(folder.folder, projectId);

		const project = ctx.db
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		if (!project) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Project disappeared while resolving folder "${folder.folder}"`,
			});
		}
		resolved.push({
			position: folder.position,
			folder: folder.folder,
			projectId,
			repoPath: project.repoPath,
			baseBranch: folder.baseBranch,
			sparsePaths: parseSparseCheckoutPaths(project.sparseCheckoutPaths),
		});
	}

	return resolved.sort((a, b) => a.position - b.position);
}

async function resolveOneFolder(
	ctx: HostServiceContext,
	folder: ProjectFolder & { linkedProjectId: string | null },
	onProgress: ProgressReporter,
): Promise<string> {
	if (folder.linkedProjectId) return folder.linkedProjectId;

	if (folder.repoPath && isDirectory(folder.repoPath)) {
		return adoptCheckout(ctx, folder.repoPath);
	}

	if (!folder.repoUrl) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Folder "${folder.folder}" has no repository on this host and no clone URL to fetch one from`,
		});
	}

	const byRemote = findProjectByRepoUrl(ctx, folder.repoUrl);
	if (byRemote) {
		recordFolderCheckout(ctx, folder, byRemote.repoPath);
		return byRemote.id;
	}

	const parsed = parseGitHubRemote(folder.repoUrl);
	if (!parsed) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Folder "${folder.folder}" has an unrecognized clone URL: ${folder.repoUrl}`,
		});
	}
	const parentDir = resolve(managedReposRoot(), parsed.owner);
	onProgress(
		`Cloning ${parsed.owner}/${parsed.name} for folder "${folder.folder}"…`,
	);
	const cloned = await cloneRepoInto(
		folder.repoUrl,
		parentDir,
		ctx.credentials,
	);
	onProgress(`Cloned ${parsed.owner}/${parsed.name} into ${cloned.repoPath}`);
	const projectId = randomUUID();
	persistLocalProject(ctx, projectId, cloned);
	recordFolderCheckout(ctx, folder, cloned.repoPath);
	return projectId;
}

/** Lets the next create link the existing checkout instead of re-cloning. */
function recordFolderCheckout(
	ctx: HostServiceContext,
	folder: ProjectFolder,
	repoPath: string,
): void {
	if (!folder.id) return;
	ctx.db
		.update(projectFolders)
		.set({ repoPath, updatedAt: Date.now() })
		.where(eq(projectFolders.id, folder.id))
		.run();
}
