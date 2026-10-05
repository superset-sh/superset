import { execFile } from "node:child_process";

/**
 * Teleport talks to git in plumbing, not porcelain: `write-tree`,
 * `commit-tree`, `read-tree`, `bundle`, `cat-file --batch-check`.
 *
 * This is the one place in host-service that reaches `git` through
 * `execFile` rather than `createUserSimpleGit`. Two of these commands need
 * to write to stdin, which simple-git's `raw` cannot do, and a per-item
 * spawn is not an option when a destination can offer twenty thousand refs.
 * Nothing is lost by dropping simple-git here: its `unsafe` allowlist exists
 * to re-permit user git config that a direct `git` invocation never blocked
 * in the first place.
 */
export interface GitRunner {
	/** Trimmed stdout of a plumbing command. */
	run(args: string[]): Promise<string>;
	/** The same, with extra environment (a temporary index, an identity). */
	runWithEnv(args: string[], env: Record<string, string>): Promise<string>;
	/** The same, writing `input` to stdin. */
	runWithInput(args: string[], input: string): Promise<string>;
}

/**
 * A commit this process creates has no user behind it, so it carries its own
 * identity rather than failing on a machine where `user.name` is unset, and
 * never invokes the user's signing key for an object they will never see.
 */
export const TELEPORT_IDENTITY = {
	GIT_AUTHOR_NAME: "Superset Teleport",
	GIT_AUTHOR_EMAIL: "teleport@superset.invalid",
	GIT_COMMITTER_NAME: "Superset Teleport",
	GIT_COMMITTER_EMAIL: "teleport@superset.invalid",
} as const;

/**
 * A capture of a large working tree, or a bundle of a long history, can be
 * tens of megabytes of stdout. The default 1 MB would truncate it into a
 * corrupt result that looks like success.
 */
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

export function createGitRunner(worktreePath: string): GitRunner {
	function exec(
		args: string[],
		options: { env?: Record<string, string>; input?: string },
	): Promise<string> {
		return new Promise((resolvePromise, reject) => {
			const child = execFile(
				"git",
				args,
				{
					cwd: worktreePath,
					env: options.env ? { ...process.env, ...options.env } : process.env,
					maxBuffer: MAX_OUTPUT_BYTES,
					// Git never prompts during a teleport: a hang behind an
					// invisible credential prompt is indistinguishable from a
					// slow transfer, and there is no terminal to answer it.
					windowsHide: true,
				},
				(error, stdout, stderr) => {
					if (error) {
						reject(
							new Error(
								`git ${args[0]} failed: ${stderr.trim() || error.message}`,
								{ cause: error },
							),
						);
						return;
					}
					resolvePromise(stdout.trim());
				},
			);
			if (options.input !== undefined) {
				child.stdin?.end(options.input);
			}
		});
	}

	return {
		run: (args) => exec(args, {}),
		runWithEnv: (args, env) => exec(args, { env }),
		runWithInput: (args, input) => exec(args, { input }),
	};
}
