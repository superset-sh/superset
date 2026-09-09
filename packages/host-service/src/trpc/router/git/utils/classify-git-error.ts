import { TRPCError } from "@trpc/server";

// Git's own text for environmental failures: the worktree was deleted out
// from under a running git process, macOS denies reading it, or the
// directory is not a repository.
const CWD_GONE_PATTERN =
	/unable to read current working directory: no such file or directory/i;
const CWD_UNREADABLE_PATTERN = /unable to read current working directory/i;
const NOT_GIT_REPO_PATTERN = /not a git repository/i;
// Git's text when the directory resolves to a repository but has no work tree
// attached: the repo is bare, or the linked worktree's admin data was removed
// or pruned. Distinct from CWD_GONE_PATTERN, where the directory itself is
// unlinked from under the running process.
const NOT_A_WORK_TREE_PATTERN = /this operation must be run in a work tree/i;
// simple-git's own text, thrown from its factory before any git process is
// spawned, when baseDir is gone. Same condition as CWD_GONE_PATTERN, caught one
// step earlier. Matched on the sentence rather than the error type: simple-git's
// GitError never assigns `this.name`, so a GitConstructError arrives named
// "Error", and the worker boundary keeps only name/message/stack. The sentence
// is also the narrower matcher — GitConstructError covers our own construction
// mistakes too, and those must keep reporting as 500s.
const SIMPLE_GIT_BASE_DIR_MISSING_PATTERN =
	/cannot use simple-git on a directory that does not exist/i;
// The macOS Command Line Tools stub. /usr/bin/git is a shim that forwards to
// the active developer directory; with no tools installed it prints this and
// exits non-zero instead of running git, so every git command fails the same
// way until the user installs them. Anchored on the stub's own prefix at the
// start of a line together with its refusal sentence: `xcode-select` has other
// complaints that are not "git cannot run here", and git names Xcode paths in
// ordinary failures all the time.
const XCODE_SELECT_NO_TOOLS_PATTERN =
	/^xcode-select: .*no developer tools were found/im;
// The same stub when Xcode is installed but cannot run: it asks xcodebuild
// where git is, xcodebuild fails to load its own libraries (a broken Xcode
// after an OS upgrade), and the stub ends with this sentence instead of
// running git. Every git command fails the same way until Xcode or the
// Command Line Tools are reinstalled. Naming `git` in the sentence keeps this
// off a hook that reaches some other tool through the same stub.
const XCODE_SELECT_GIT_NOT_LOCATED_PATTERN =
	/^xcode-select: Failed to locate 'git', requesting installation of command line developer tools\.$/im;
// A content filter's helper program is not installed on this machine. Git runs
// `filter.<name>.process`/`.clean` through the shell with the configured
// command as the shell's $0, so an absent helper fails as
// `<filter command>: <helper>: command not found`, and git then reports the
// filter pipe dying as "the remote end hung up unexpectedly". A required
// filter aborts the whole command, so everything touching a filtered path —
// including the status snapshot we poll — fails until the helper is installed.
// All three parts are required, in the order git emits them. The filter's own
// invocation must appear on the command-not-found line: without it this would
// also claim a remote host that lacks git-receive-pack, and a failing hook that
// happens to precede a network drop — both of which print the same pair. Only
// `filter.<name>.process` speaks the packet protocol whose pipe dying produces
// "the remote end hung up unexpectedly", so requiring it costs no real case;
// `.clean`/`.smudge` failures say "external filter ... failed" instead.
// Filters that are installed and then fail — refusing a file, missing a key —
// say "external filter ... failed" instead and stay unclassified.
const FILTER_HELPER_MISSING_PATTERN =
	/filter-process.*: command not found$[\s\S]*?^fatal: the remote end hung up unexpectedly/im;
// Git cannot read a tree object its own refs point at — a damaged or
// incompletely fetched object store (a truncated packfile, most often). Every
// command that walks a commit fails until the repository is repaired.
// Requiring the object id keeps this off git's other "unable to read"
// failures, which name blobs, loose files and stdin rather than this damage.
const UNREADABLE_TREE_OBJECT_PATTERN =
	/unable to read tree \(?[0-9a-f]{7,64}\)?/i;
// Git's text (is_submodule_modified, submodule.c) when a gitlink in the index
// — a nested repository or submodule — has a `.git` that is a directory but
// not a repository: HEAD, objects or refs are gone, which is what a cloud-sync
// client leaves behind when it rewrites a nested `.git`. Git opens every
// gitlink before it reports status or a diff and dies at the first bad one, so
// status, diff and add all fail until the nested checkout is repaired or its
// gitlink removed. The workspace itself resolved fine: git's wording for a
// repository that cannot be found is "not a git repository", which
// NOT_GIT_REPO_PATTERN keeps.
const NESTED_REPO_GIT_DIR_INVALID_PATTERN =
	/^fatal: '.*\/\.git' not recognized as a git repository$/im;

/**
 * Rethrows environmental git failures as typed non-500 TRPCErrors — the same
 * classification resolve-worktree.ts applies before git runs — so the Sentry
 * middleware doesn't report them as bugs. No-op for anything else; genuine
 * unexpected git failures keep reporting as 500s.
 */
export function rethrowEnvironmentalGitError(error: unknown): void {
	if (error instanceof TRPCError || !(error instanceof Error)) return;
	if (NOT_GIT_REPO_PATTERN.test(error.message)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: error.message,
			cause: { kind: "NOT_GIT_REPO" },
		});
	}
	if (NOT_A_WORK_TREE_PATTERN.test(error.message)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: error.message,
			cause: { kind: "NOT_A_WORK_TREE" },
		});
	}
	if (CWD_GONE_PATTERN.test(error.message)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: error.message,
			cause: { kind: "WORKTREE_MISSING" },
		});
	}
	if (SIMPLE_GIT_BASE_DIR_MISSING_PATTERN.test(error.message)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: error.message,
			cause: { kind: "WORKTREE_MISSING" },
		});
	}
	if (CWD_UNREADABLE_PATTERN.test(error.message)) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: error.message,
			cause: { kind: "GIT_ENVIRONMENT" },
		});
	}
	if (
		XCODE_SELECT_NO_TOOLS_PATTERN.test(error.message) ||
		XCODE_SELECT_GIT_NOT_LOCATED_PATTERN.test(error.message)
	) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: error.message,
			cause: { kind: "GIT_ENVIRONMENT" },
		});
	}
	if (FILTER_HELPER_MISSING_PATTERN.test(error.message)) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: error.message,
			cause: { kind: "GIT_ENVIRONMENT" },
		});
	}
	if (
		UNREADABLE_TREE_OBJECT_PATTERN.test(error.message) ||
		NESTED_REPO_GIT_DIR_INVALID_PATTERN.test(error.message)
	) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: error.message,
			cause: { kind: "GIT_REPO_DAMAGED" },
		});
	}
}
