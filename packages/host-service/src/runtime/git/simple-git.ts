import { USER_GIT_ENV_SIMPLE_GIT_OPTIONS } from "@superset/shared/simple-git-options";
import simpleGit, { type SimpleGit, type SimpleGitOptions } from "simple-git";
import type { GitFactoryOptions } from "./types";

// Superset is a local Git client, so inherited user Git config/env is expected
// behavior. simple-git 3.36 blocks these hooks by default; allow them centrally
// instead of deleting individual env vars and changing Git semantics.
const SIMPLE_GIT_OPTIONS =
	USER_GIT_ENV_SIMPLE_GIT_OPTIONS satisfies Partial<SimpleGitOptions>;

export function createUserSimpleGit(
	baseDir?: string,
	options?: GitFactoryOptions,
): SimpleGit {
	const gitOptions = { ...SIMPLE_GIT_OPTIONS, timeout: options?.timeout };
	return baseDir ? simpleGit(baseDir, gitOptions) : simpleGit(gitOptions);
}
