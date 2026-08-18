export { createGitEnvResolver, createGitFactory } from "./git";
export { listGitIgnoredDirs } from "./ignored-dirs";
export type { ResolvedRef, ResolveRefOptions } from "./refs";
export {
	asLocalRef,
	asRemoteRef,
	resolveDefaultBranchName,
	resolveRef,
	resolveUpstream,
} from "./refs";
export type { GitCredentialProvider, GitFactory } from "./types";
