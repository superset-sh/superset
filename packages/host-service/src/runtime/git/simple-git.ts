import { userGitSimpleGitOptions } from "@superset/shared/simple-git-options";
import { type SimpleGit, type SimpleGitOptions, simpleGit } from "simple-git";

// Superset is a local Git client, so inherited user Git config/env is expected
// behavior. simple-git blocks these hooks by default; allow them centrally
// instead of deleting individual env vars and changing Git semantics.
// Pass `env` here rather than chaining `.env()`: simple-git 4 throws on a
// guarded key that was not allowed when the instance was built.
export function createUserSimpleGit(
	baseDir?: string,
	options?: Pick<SimpleGitOptions, "timeout" | "abort"> & {
		env?: Record<string, string | undefined>;
	},
): SimpleGit {
	const { env, ...rest } = options ?? {};
	const gitOptions = {
		...(userGitSimpleGitOptions(
			env ?? process.env,
		) satisfies Partial<SimpleGitOptions>),
		...rest,
	};
	const git = baseDir ? simpleGit(baseDir, gitOptions) : simpleGit(gitOptions);
	return env ? git.env(env) : git;
}
