import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { simpleGit } from "simple-git";
import { rethrowEnvironmentalGitError } from "./classify-git-error";

function capture(error: unknown): TRPCError | null {
	try {
		rethrowEnvironmentalGitError(error);
		return null;
	} catch (thrown) {
		return thrown as TRPCError;
	}
}

function causeKind(thrown: TRPCError | null): string | undefined {
	return (thrown?.cause as { kind?: string } | undefined)?.kind;
}

describe("rethrowEnvironmentalGitError", () => {
	test("worktree deleted mid-command → NOT_FOUND / WORKTREE_MISSING", () => {
		const thrown = capture(
			new Error(
				"fatal: Unable to read current working directory: No such file or directory\n",
			),
		);
		expect(thrown?.code).toBe("NOT_FOUND");
		expect(causeKind(thrown)).toBe("WORKTREE_MISSING");
	});

	test("bare repo or pruned worktree → NOT_FOUND / NOT_A_WORK_TREE", () => {
		const message = "fatal: this operation must be run in a work tree\n";
		const thrown = capture(new Error(message));
		expect(thrown?.code).toBe("NOT_FOUND");
		expect(causeKind(thrown)).toBe("NOT_A_WORK_TREE");
		expect(thrown?.message).toBe(message);
	});

	test("permission wall → PRECONDITION_FAILED / GIT_ENVIRONMENT", () => {
		const thrown = capture(
			new Error(
				"fatal: Unable to read current working directory: Operation not permitted\n",
			),
		);
		expect(thrown?.code).toBe("PRECONDITION_FAILED");
		expect(causeKind(thrown)).toBe("GIT_ENVIRONMENT");
	});

	test("not a repository → BAD_REQUEST / NOT_GIT_REPO", () => {
		const message =
			"fatal: not a git repository (or any of the parent directories): .git\n";
		const thrown = capture(new Error(message));
		expect(thrown?.code).toBe("BAD_REQUEST");
		expect(causeKind(thrown)).toBe("NOT_GIT_REPO");
		expect(thrown?.message).toBe(message);
	});

	test("simple-git construct error → NOT_FOUND / WORKTREE_MISSING", () => {
		const message = "Cannot use simple-git on a directory that does not exist";
		const thrown = capture(new Error(message));
		expect(thrown?.code).toBe("NOT_FOUND");
		expect(causeKind(thrown)).toBe("WORKTREE_MISSING");
		expect(thrown?.message).toBe(message);
	});

	test("simple-git construct errors arrive named Error, not GitConstructError", () => {
		// simple-git's GitError never assigns `this.name`, so the subclass name is
		// invisible at runtime — matching on it would make the branch above dead
		// code. The worker boundary drops `config` too, leaving only the message.
		let caught: unknown;
		try {
			simpleGit("/superset-classifier-probe/does/not/exist");
		} catch (error) {
			caught = error;
		}
		expect((caught as Error).name).toBe("Error");
		expect((caught as Error).message).toBe(
			"Cannot use simple-git on a directory that does not exist",
		);
	});

	test("no-ops for TRPCErrors and genuine failures", () => {
		expect(
			capture(new TRPCError({ code: "NOT_FOUND", message: "missing" })),
		).toBeNull();
		expect(capture(new Error("fatal: bad revision 'HEAD~1'"))).toBeNull();
		expect(
			capture(
				new Error(
					"fatal: Unable to create '/repo/.git/index.lock': File exists.\n",
				),
			),
		).toBeNull();
		expect(
			capture(new Error("fatal: detected dubious ownership in repository\n")),
		).toBeNull();
		expect(capture(new Error("fatal: cannot chdir to work tree\n"))).toBeNull();
		expect(capture("string error")).toBeNull();
	});

	test("does not swallow other 'does not exist' failures", () => {
		// The construct-error branch must key on simple-git's own sentence, not on
		// the phrase "does not exist" — git says that about refs, paths and remotes
		// all the time, and those are ordinary failures the caller should see.
		expect(
			capture(new Error("fatal: path 'src/app.ts' does not exist in 'HEAD'\n")),
		).toBeNull();
		expect(
			capture(new Error("error: remote origin does not exist.\n")),
		).toBeNull();
		expect(
			capture(
				new Error(
					"fatal: invalid object name 'feature/directory-that-does-not-exist'\n",
				),
			),
		).toBeNull();
	});

	test("keeps our own simple-git misconfiguration reporting as a 500", () => {
		// simple-git raises GitConstructError for more than one condition. Only the
		// missing-directory one is environmental; anything else on that path is a
		// bug in how we construct the client and must stay unclassified.
		expect(
			capture(new Error("Cannot use simple-git with an invalid configuration")),
		).toBeNull();
		expect(
			capture(new Error("Unable to find path to repository in parent tree")),
		).toBeNull();
	});

	test("Command Line Tools missing → PRECONDITION_FAILED / GIT_ENVIRONMENT", () => {
		// Verbatim stub output: on macOS /usr/bin/git forwards to the Command
		// Line Tools, and prints this instead of running when they are absent.
		const message =
			"xcode-select: note: No developer tools were found, requesting install.\n" +
			"If developer tools are located at a non-default location on disk, use `sudo xcode-select --switch path/to/Xcode.app` to specify the Xcode that you wish to use for command line developer tools, and cancel the installation dialog.\n" +
			"See `man xcode-select` for more details.\n";
		const thrown = capture(new Error(message));
		expect(thrown?.code).toBe("PRECONDITION_FAILED");
		expect(causeKind(thrown)).toBe("GIT_ENVIRONMENT");
		expect(thrown?.message).toBe(message);
	});

	test("unreadable tree object → PRECONDITION_FAILED / GIT_REPO_DAMAGED", () => {
		const message =
			"fatal: unable to read tree f3cfda51e445b3c911572cf9ae3dc34d78fc4c35\n";
		const thrown = capture(new Error(message));
		expect(thrown?.code).toBe("PRECONDITION_FAILED");
		expect(causeKind(thrown)).toBe("GIT_REPO_DAMAGED");
		expect(thrown?.message).toBe(message);
	});

	test("unreadable tree object behind a truncated packfile", () => {
		// The same condition with git's own diagnosis of the damage in front of
		// it, and git's parenthesised phrasing of the sentence.
		const thrown = capture(
			new Error(
				"error: file .git/objects/pack/pack-816a419ea2792b300adb04c1f8bc739065981ebe.pack is far too short to be a packfile\n" +
					"fatal: unable to read tree (f3cfda51e445b3c911572cf9ae3dc34d78fc4c35)\n",
			),
		);
		expect(thrown?.code).toBe("PRECONDITION_FAILED");
		expect(causeKind(thrown)).toBe("GIT_REPO_DAMAGED");
	});

	test("does not claim unrelated Xcode and developer-tools output", () => {
		// The stub is identified by its own prefix *and* its refusal sentence.
		// Neither half alone is distinctive: git says "Xcode" whenever a path
		// contains it, and xcode-select has other, unrelated complaints that are
		// not "git cannot run here".
		expect(
			capture(
				new Error(
					"xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory '/Library/Developer/CommandLineTools' is a command line tools instance\n",
				),
			),
		).toBeNull();
		expect(
			capture(
				new Error(
					"fatal: pathspec 'ios/Runner.xcodeproj/project.pbxproj' did not match any files known to git\n",
				),
			),
		).toBeNull();
		expect(
			capture(
				new Error(
					"error: unable to stat 'Library/Developer/Xcode/DerivedData/Runner/info.plist'\n",
				),
			),
		).toBeNull();
	});

	test("does not claim the refusal sentence when git is not the one refusing", () => {
		// A hook that shells out to an Xcode tool can print the stub's sentence
		// into git's stderr while git itself failed for its own reason. Only a
		// line that *starts* with the stub's prefix means "git cannot run here";
		// matching the sentence alone would silence the hook failure.
		expect(
			capture(
				new Error(
					"hint: The '.git/hooks/pre-commit' hook was ignored because it's not set as executable.\n" +
						"No developer tools were found, requesting install.\n" +
						"error: cannot run .git/hooks/pre-commit: No such file or directory\n",
				),
			),
		).toBeNull();
	});

	test("does not claim git's other 'unable to read' failures", () => {
		// Git says "unable to read" about several object kinds and about plain
		// files. Only the tree variant names the damage this branch describes;
		// the rest are ordinary failures that must keep reporting as 500s.
		expect(
			capture(
				new Error(
					"fatal: unable to read d83d2d027bcd790f397d1ef07c663ca57d44cac2\n",
				),
			),
		).toBeNull();
		expect(
			capture(
				new Error(
					"error: unable to read sha1 file of src/index.ts (e69de29bb2d1d6434b8b29ae775ad8c2e48c5391)\n",
				),
			),
		).toBeNull();
		expect(
			capture(new Error("error: unable to read asciidoc from stdin\n")),
		).toBeNull();
	});

	test("keeps the working-directory branch ahead of the damaged-repo branch", () => {
		// "unable to read current working directory" is an environment failure,
		// not object-store damage — the new branch must not reclassify it.
		const thrown = capture(
			new Error(
				"fatal: Unable to read current working directory: Operation not permitted\n",
			),
		);
		expect(causeKind(thrown)).toBe("GIT_ENVIRONMENT");
	});

	test("genuine failures on the getStatus path still report as 500s", () => {
		// A resource exhaustion bug we would want to hear about.
		expect(capture(new Error("spawn git EAGAIN"))).toBeNull();
	});

	test("missing filter helper → PRECONDITION_FAILED / GIT_ENVIRONMENT", () => {
		// Verbatim from the Sentry group: a repository configured for git-lfs on
		// a machine without the helper installed. Git runs the filter through the
		// shell, which cannot find the helper, and git then reports the filter
		// pipe dying. Polled status re-reports it indefinitely.
		const message =
			"git-lfs filter-process: git-lfs: command not found\n" +
			"fatal: the remote end hung up unexpectedly\n";
		const thrown = capture(new Error(message));
		expect(thrown?.code).toBe("PRECONDITION_FAILED");
		expect(causeKind(thrown)).toBe("GIT_ENVIRONMENT");
		expect(thrown?.message).toBe(message);
	});

	test("missing filter helper is not specific to git-lfs", () => {
		// The branch names the shape git produces for any filter helper it cannot
		// execute, not one vendor's binary. Reproduced against a repository whose
		// `filter.<name>.process` points at a program that is not installed.
		const thrown = capture(
			new Error(
				"fake-lfs-helper filter-process: fake-lfs-helper: command not found\n" +
					"fatal: the remote end hung up unexpectedly\n",
			),
		);
		expect(thrown?.code).toBe("PRECONDITION_FAILED");
		expect(causeKind(thrown)).toBe("GIT_ENVIRONMENT");
	});

	test("keeps installed filters that fail for their own reasons as 500s", () => {
		// Git emits a family of similar-looking filter failures that are not a
		// missing helper. The helper ran and refused, so nothing about the
		// machine's setup is wrong in the way this branch names — these must keep
		// reporting as 500s. Both messages are real traffic from the same group.
		expect(
			capture(
				new Error(
					"git-secret-protector: AES key for filter 'secrets-dev' is not cached locally. Run: git-secret-protector pull-aes-key secrets-dev\n" +
						"error: external filter 'git-secret-protector encrypt %f' failed 1\n" +
						"error: external filter 'git-secret-protector encrypt %f' failed\n" +
						"fatal: infra/secrets.tfvars: clean filter 'secrets-dev' failed\n",
				),
			),
		).toBeNull();
		expect(
			capture(
				new Error(
					'unknown command ""\n' +
						"error: external filter 'git-lfs filter-process' failed\n" +
						"fatal: assets/img/hash.png: clean filter 'lfs' failed\n",
				),
			),
		).toBeNull();
		expect(
			capture(
				new Error("fatal: assets/img/hash.png: clean filter 'lfs' failed\n"),
			),
		).toBeNull();
	});

	test("does not claim the same pair from a non-filter source", () => {
		// A remote host without git, and a failing hook followed by a network
		// drop, both print "command not found" and then the remote hanging up.
		// Neither is a missing filter helper, and the filter's own invocation on
		// the command-not-found line is what separates them.
		expect(
			capture(
				new Error(
					"bash: git-receive-pack: command not found\n" +
						"fatal: The remote end hung up unexpectedly\n",
				),
			),
		).toBeNull();
		expect(
			capture(
				new Error(
					".git/hooks/post-checkout: line 3: some-linter: command not found\n" +
						"fatal: the remote end hung up unexpectedly\n",
				),
			),
		).toBeNull();
	});

	test("does not claim either half of the missing-helper pair alone", () => {
		// Neither sentence is distinctive by itself. Git reports the remote end
		// hanging up for ordinary network failures, and the shell says "command
		// not found" for hooks and other programs that are not filters — matching
		// on one half would silence a broken clone or a broken hook.
		expect(
			capture(
				new Error(
					"fatal: the remote end hung up unexpectedly\n" +
						"fatal: early EOF\n" +
						"fatal: index-pack failed\n",
				),
			),
		).toBeNull();
		expect(
			capture(
				new Error(
					".git/hooks/pre-commit: line 2: definitely-not-installed-linter: command not found\n",
				),
			),
		).toBeNull();
		expect(
			capture(
				new Error(
					"error: cannot run definitely-not-a-real-ssh: No such file or directory\n" +
						"fatal: unable to fork\n",
				),
			),
		).toBeNull();
	});
});
