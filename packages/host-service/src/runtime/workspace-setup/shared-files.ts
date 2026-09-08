import { lstat, mkdir, readlink, realpath, symlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { SimpleGit } from "simple-git";

export function validateSharedPath(path: string): void {
	if (
		!path ||
		path.length > 1024 ||
		isAbsolute(path) ||
		/[\\\0\r\n]/.test(path) ||
		path
			.split("/")
			.some(
				(part) =>
					!part ||
					part === "." ||
					part === ".." ||
					part.toLowerCase() === ".git" ||
					part.toLowerCase() === "node_modules",
			)
	) {
		throw new Error(`Invalid shared file path: ${path}`);
	}
}
function contained(root: string, path: string): boolean {
	const rel = relative(root, path);
	return (
		rel !== "" &&
		rel !== ".." &&
		!rel.startsWith(`..${sep}`) &&
		!isAbsolute(rel)
	);
}
export async function validateSharedSource(
	git: SimpleGit,
	repoPath: string,
	path: string,
): Promise<string> {
	validateSharedPath(path);
	const root = await realpath(repoPath);
	const source = resolve(root, path);
	const stat = await lstat(source);
	if (!stat.isFile() || !contained(root, await realpath(source)))
		throw new Error(
			`Shared path must be a file inside the root checkout: ${path}`,
		);
	const tracked = await git.raw(["ls-files", "--", path]);
	const ignored = await git.raw(["check-ignore", "--", path]).catch(() => "");
	if (tracked.trim() || !ignored.trim())
		throw new Error(`Only ignored, untracked files can be shared: ${path}`);
	return source;
}
/** Never replace an existing file or follow a destination directory symlink. */
export async function linkSharedFile(
	git: SimpleGit,
	repoPath: string,
	worktreePath: string,
	path: string,
): Promise<void> {
	const source = await validateSharedSource(git, repoPath, path);
	const root = await realpath(worktreePath);
	const destination = resolve(root, path);
	if (!contained(root, destination))
		throw new Error(`Invalid shared file destination: ${path}`);
	let parent = root;
	for (const part of path.split("/").slice(0, -1)) {
		parent = resolve(parent, part);
		await mkdir(parent).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== "EEXIST") throw error;
		});
		const stat = await lstat(parent);
		if (!stat.isDirectory() || stat.isSymbolicLink())
			throw new Error(`Shared file parent is not a directory: ${path}`);
	}
	const existing = await lstat(destination).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return null;
			throw error;
		},
	);
	if (existing) {
		if (
			existing.isSymbolicLink() &&
			resolve(dirname(destination), await readlink(destination)) === source
		)
			return;
		throw new Error(
			`A file already exists at ${path}; move it before retrying or skip this file.`,
		);
	}
	await symlink(source, destination, "file");
}
