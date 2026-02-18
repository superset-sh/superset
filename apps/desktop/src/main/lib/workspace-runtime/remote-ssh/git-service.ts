/**
 * Remote Git Service
 *
 * Provides git operations on remote hosts via SSH exec.
 */

import type { SSHConnection } from "./connection";

export interface RemoteWorktreeInfo {
	path: string;
	branch: string;
	head: string;
	isBare: boolean;
}

export class RemoteGitService {
	private connection: SSHConnection;

	constructor(connection: SSHConnection) {
		this.connection = connection;
	}

	setConnection(connection: SSHConnection): void {
		this.connection = connection;
	}

	/**
	 * List git worktrees in a remote repository.
	 */
	async worktreeList(repoPath: string): Promise<RemoteWorktreeInfo[]> {
		const result = await this.connection.exec(
			"git worktree list --porcelain",
			repoPath,
		);

		if (result.code !== 0) {
			throw new Error(`git worktree list failed: ${result.stderr}`);
		}

		const worktrees: RemoteWorktreeInfo[] = [];
		let current: Partial<RemoteWorktreeInfo> = {};

		for (const line of result.stdout.split("\n")) {
			if (line.startsWith("worktree ")) {
				if (current.path) worktrees.push(current as RemoteWorktreeInfo);
				current = { path: line.slice(9), isBare: false };
			} else if (line.startsWith("HEAD ")) {
				current.head = line.slice(5);
			} else if (line.startsWith("branch ")) {
				current.branch = line.slice(7).replace("refs/heads/", "");
			} else if (line === "bare") {
				current.isBare = true;
			}
		}

		if (current.path) worktrees.push(current as RemoteWorktreeInfo);
		return worktrees;
	}

	/**
	 * Add a git worktree on the remote host.
	 */
	async worktreeAdd(
		repoPath: string,
		worktreePath: string,
		branch: string,
		baseBranch?: string,
	): Promise<void> {
		const args = baseBranch
			? `git worktree add -b ${branch} ${escapeArg(worktreePath)} ${baseBranch}`
			: `git worktree add ${escapeArg(worktreePath)} ${branch}`;

		const result = await this.connection.exec(args, repoPath);
		if (result.code !== 0) {
			throw new Error(`git worktree add failed: ${result.stderr}`);
		}
	}

	/**
	 * Remove a git worktree on the remote host.
	 */
	async worktreeRemove(
		repoPath: string,
		worktreePath: string,
		force = false,
	): Promise<void> {
		const forceFlag = force ? " --force" : "";
		const result = await this.connection.exec(
			`git worktree remove${forceFlag} ${escapeArg(worktreePath)}`,
			repoPath,
		);
		if (result.code !== 0) {
			throw new Error(`git worktree remove failed: ${result.stderr}`);
		}
	}

	/**
	 * Get the git status of a remote repository.
	 */
	async status(repoPath: string): Promise<string> {
		const result = await this.connection.exec(
			"git status --porcelain",
			repoPath,
		);
		return result.stdout;
	}

	/**
	 * Get the current branch of a remote repository.
	 */
	async getCurrentBranch(repoPath: string): Promise<string> {
		const result = await this.connection.exec(
			"git rev-parse --abbrev-ref HEAD",
			repoPath,
		);
		if (result.code !== 0) {
			throw new Error(`Failed to get branch: ${result.stderr}`);
		}
		return result.stdout.trim();
	}

	/**
	 * Check if a path exists on the remote host.
	 */
	async pathExists(remotePath: string): Promise<boolean> {
		const result = await this.connection.exec(
			`test -d ${escapeArg(remotePath)} && echo "exists"`,
		);
		return result.stdout.trim() === "exists";
	}

	/**
	 * Check if a path is a git repository.
	 */
	async isGitRepo(remotePath: string): Promise<boolean> {
		const result = await this.connection.exec(
			"git rev-parse --is-inside-work-tree 2>/dev/null",
			remotePath,
		);
		return result.stdout.trim() === "true";
	}
}

function escapeArg(arg: string): string {
	return `'${arg.replace(/'/g, "'\\''")}'`;
}
