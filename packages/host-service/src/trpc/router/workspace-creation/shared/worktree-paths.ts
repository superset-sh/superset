import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	normalize,
	resolve,
	sep,
} from "node:path";
import { TRPCError } from "@trpc/server";

// Kept outside the primary checkout so editors, file watchers, and
// ignore rules treat worktrees as separate trees, not nested ones.
export function defaultWorktreesRoot(): string {
	return join(homedir(), ".superset", "worktrees");
}

export function normalizeWorktreeBaseDir(
	input: string | null | undefined,
): string | null {
	const trimmed = input?.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith("~")) {
		const rest = trimmed.slice(1);
		if (rest === "" || rest.startsWith("/") || rest.startsWith("\\")) {
			return normalize(join(homedir(), rest));
		}
	}

	if (!isAbsolute(trimmed)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Worktree location must be an absolute path or start with ~",
		});
	}

	return resolve(trimmed);
}

export type WorktreeFolderProject = { id: string; name: string };

const MAX_FOLDER_NAME_LENGTH = 80;
const RESERVED_FOLDER_CHARACTERS = new Set('<>:"/\\|?*');
// Windows refuses these as a file or folder name, with or without an extension.
const WINDOWS_DEVICE_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

function toFolderName(projectName: string): string {
	const replaced = Array.from(projectName.normalize("NFC"), (character) =>
		RESERVED_FOLDER_CHARACTERS.has(character) ||
		(character.codePointAt(0) ?? 0) < 0x20
			? "-"
			: character,
	).join("");
	const folderName = replaced
		.replace(/\s+/g, " ")
		.slice(0, MAX_FOLDER_NAME_LENGTH)
		.replace(/^[. ]+|[. ]+$/g, "");
	return WINDOWS_DEVICE_NAME.test(folderName) ? `_${folderName}` : folderName;
}

function disambiguatedFolderName(folderName: string, projectId: string) {
	return `${folderName}-${projectId.slice(0, 8)}`;
}

/**
 * The folder under the worktrees base that holds a project's worktrees: the
 * project's name, so the path reads `<base>/<project name>/<branch>`. Two
 * projects sharing a name on one host (two clones of a repo) would otherwise
 * share a folder and collide on branch names, so each of them takes a short
 * id suffix; a project with no usable name falls back to its id.
 */
export function resolveProjectWorktreesFolder(
	project: WorktreeFolderProject,
	otherProjectNames: readonly string[],
): string {
	const folderName = toFolderName(project.name);
	if (!folderName) return project.id;
	const taken = otherProjectNames.some(
		(name) => toFolderName(name).toLowerCase() === folderName.toLowerCase(),
	);
	return taken ? disambiguatedFolderName(folderName, project.id) : folderName;
}

/**
 * Every folder a project's worktrees may live under: its current name-based
 * folder, the suffixed form, and the bare project id older releases used.
 * Worktrees keep the absolute path they were created with, so the
 * removal guard has to keep recognising all of them.
 */
export function projectWorktreesFolderCandidates(
	project: WorktreeFolderProject,
): string[] {
	const folderName = toFolderName(project.name);
	return folderName
		? [folderName, disambiguatedFolderName(folderName, project.id), project.id]
		: [project.id];
}

export function projectWorktreesRoot(
	folder: string,
	worktreeBaseDir?: string | null,
): string {
	return resolve(worktreeBaseDir ?? defaultWorktreesRoot(), folder);
}

/**
 * True when `path` resolves strictly inside the project's managed worktrees
 * root. The destroy saga's direct `rm -rf` (taken when the project repo is
 * gone and there is nothing to run `git worktree remove` in) refuses
 * anything else, so an adopted or corrupt `worktreePath` can never delete
 * user data outside the managed folder.
 */
export function isInsideProjectWorktreesRoot(
	path: string,
	project: WorktreeFolderProject,
	worktreeBaseDir?: string | null,
): boolean {
	// Both prefixes are canonicalised: a `<base>/<folder>` entry that is a
	// symlink out of the base would otherwise let a path beneath it pass.
	const base = normalizePath(worktreeBaseDir ?? defaultWorktreesRoot());
	const resolved = normalizePath(path);
	return projectWorktreesFolderCandidates(project).some((folder) => {
		const root = normalizePath(projectWorktreesRoot(folder, worktreeBaseDir));
		return (
			root !== base &&
			root.startsWith(base + sep) &&
			resolved !== root &&
			resolved.startsWith(root + sep)
		);
	});
}

function normalizePath(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		// A dangling or unreadable leaf still has a real parent. Canonicalise
		// that so the leaf compares against the same prefix as a base that
		// sits behind a symlink (macOS `/var` → `/private/var`).
		const abs = resolve(p);
		try {
			return join(realpathSync(dirname(abs)), basename(abs));
		} catch {
			return abs;
		}
	}
}

export function safeResolveWorktreePath(
	folder: string,
	branchName: string,
	worktreeBaseDir?: string | null,
): string {
	const projectRoot = projectWorktreesRoot(folder, worktreeBaseDir);
	const worktreePath = resolve(projectRoot, branchName);
	if (
		worktreePath !== projectRoot &&
		!worktreePath.startsWith(projectRoot + sep)
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid branch name: path traversal detected (${branchName})`,
		});
	}
	return worktreePath;
}
