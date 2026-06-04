export { createGitFactory } from "./git";
export type { ResolvedRef, ResolveRefOptions } from "./refs";
export {
	asLocalRef,
	asRemoteRef,
	resolveDefaultBranchName,
	resolveRef,
	resolveUpstream,
} from "./refs";
export type { GitCredentialProvider, GitFactory } from "./types";
