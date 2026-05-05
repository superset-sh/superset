import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";

export interface GitFixture {
	repoPath: string;
	git: SimpleGit;
	commit: (message: string, files?: Record<string, string>) => Promise<string>;
	dispose: () => void;
}

/**
 * Create a real on-disk git repo in a temp directory. Configures user.name /
 * user.email locally so commits don't depend on the developer's global config,
 * and seeds an initial commit on `main` so HEAD is resolvable. Caller MUST
 * call `dispose()` to clean up.
 */
export async function createGitFixture(): Promise<GitFixture> {
	// Resolve symlinks (e.g. macOS /var → /private/var) so paths handed to
	// workspace-fs match what its realpath-based root checks see.
	const repoPath = realpathSync(
		mkdtempSync(join(tmpdir(), "host-service-test-repo-")),
	);
	const git = simpleGit(repoPath);

	await git.init(["--initial-branch=main"]);
	await git.addConfig("user.email", "test@superset.local");
	await git.addConfig("user.name", "Test Runner");
	await git.addConfig("commit.gpgsign", "false");

	const commit = async (
		message: string,
		files: Record<string, string> = { "README.md": message },
	): Promise<string> => {
		for (const [path, contents] of Object.entries(files)) {
			writeFileSync(join(repoPath, path), contents);
			await git.add(path);
		}
		const result = await git.commit(message, undefined, {
			"--allow-empty": null,
		});
		return result.commit;
	};

	await commit("initial commit");

	const dispose = (): void => {
		rmSync(repoPath, { recursive: true, force: true });
	};

	return { repoPath, git, commit, dispose };
}
