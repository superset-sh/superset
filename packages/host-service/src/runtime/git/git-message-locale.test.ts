import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TRPCError } from "@trpc/server";
import { rethrowEnvironmentalGitError } from "../../trpc/router/git/utils/classify-git-error";
import { getGitStatusSnapshot } from "../../trpc/router/git/utils/git-status";
import { createGitEnvResolver } from "./git";
import { createUserSimpleGit } from "./simple-git";
import type { GitCredentialProvider } from "./types";

// Git translates its diagnostics, and classify-git-error.ts recognises git's
// own English wording — so the classifier only works if the subprocess speaks
// English. These tests drive the real status path against a `git` that has
// translations installed, which the machines in HOST-SERVICE-3Q do and CI does
// not: the stub resolves the message locale exactly the way GNU gettext does
// (LC_ALL over LC_MESSAGES over LANG; LANGUAGE consulted only when the
// resolved locale is not "C") and answers in that language.
const GIT_TRANSLATING_STUB = `#!/bin/sh
locale="\${LC_ALL:-\${LC_MESSAGES:-\${LANG:-C}}}"
if [ "$locale" = "C" ]; then
	language="C"
else
	language="\${LANGUAGE:-$locale}"
fi
case "$language" in
	fr*) echo "fatal: ce n'est pas un dépôt git (ni aucun des répertoires parents) : .git" >&2 ;;
	*) echo "fatal: not a git repository (or any of the parent directories): .git" >&2 ;;
esac
exit 128
`;

// A French desktop: every locale variable set, including the one gettext reads
// ahead of all of them.
const FRENCH_USER_ENV = {
	LANG: "fr_FR.UTF-8",
	LANGUAGE: "fr",
	LC_ALL: "fr_FR.UTF-8",
	LC_MESSAGES: "fr_FR.UTF-8",
};

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function providerWithEnv(env: Record<string, string>): GitCredentialProvider {
	return {
		getCredentials: async () => ({ env: { ...env } }),
		getToken: async () => null,
		credentialRemedy: () => "no credentials",
	};
}

/** A PATH holding nothing but a `git` that translates its diagnostics. */
function translatingGitPath(): string {
	const dir = tempDir("superset-git-stub-");
	const stub = join(dir, "git");
	writeFileSync(stub, GIT_TRANSLATING_STUB);
	chmodSync(stub, 0o755);
	return dir;
}

/** The error that escapes the status snapshot — what getStatus's catch sees. */
async function statusSnapshotFailure(
	worktreePath: string,
	env: Record<string, string>,
): Promise<Error> {
	try {
		await getGitStatusSnapshot({
			git: createUserSimpleGit(worktreePath).env(env),
			worktreePath,
		});
	} catch (error) {
		return error as Error;
	}
	throw new Error("expected the status snapshot to fail");
}

function classify(error: unknown): TRPCError | null {
	try {
		rethrowEnvironmentalGitError(error);
		return null;
	} catch (thrown) {
		return thrown as TRPCError;
	}
}

describe("git message locale", () => {
	test("pins the message locale over every locale variable the user set", async () => {
		const repo = tempDir("superset-git-locale-");

		const env = await createGitEnvResolver(providerWithEnv(FRENCH_USER_ENV))(
			repo,
		);

		// "C" exactly, not "POSIX": gettext ignores LANGUAGE only for "C", and
		// LC_ALL is the only variable a user's own LC_ALL cannot outrank.
		expect(env.LC_ALL).toBe("C");
	});

	test("a localized 'not a git repository' failure classifies as a non-500", async () => {
		const notARepo = tempDir("superset-git-locale-");
		const provider = providerWithEnv({
			...FRENCH_USER_ENV,
			PATH: translatingGitPath(),
		});

		const env = await createGitEnvResolver(provider)(notARepo);
		const error = await statusSnapshotFailure(notARepo, env);

		expect(error.message).toContain("not a git repository");
		const thrown = classify(error);
		expect(thrown?.code).toBe("BAD_REQUEST");
		expect((thrown?.cause as { kind?: string } | undefined)?.kind).toBe(
			"NOT_GIT_REPO",
		);
	});

	test("the same failure in the user's own locale falls through unclassified", async () => {
		// The pre-pin env, kept as the reason this is fixed in the environment
		// rather than by adding a French pattern: nothing in the classifier
		// matches git's French wording, so the condition reports as a 500.
		const notARepo = tempDir("superset-git-locale-");
		const unpinnedEnv = {
			...FRENCH_USER_ENV,
			PATH: translatingGitPath(),
			GIT_OPTIONAL_LOCKS: "0",
		};

		const error = await statusSnapshotFailure(notARepo, unpinnedEnv);

		expect(error.message).toContain("dépôt git");
		expect(classify(error)).toBeNull();
	});

	test("non-ASCII paths still round-trip through status parsing", async () => {
		// LC_ALL pins LC_CTYPE too. Git reports paths as bytes and quotes them by
		// core.quotePath rather than by locale, and the snapshot reads them
		// through `-z`, which disables quoting outright — so the pin must not
		// disturb a worktree whose filenames are not ASCII.
		const repo = tempDir("superset-git-locale-");
		const setup = createUserSimpleGit(repo);
		await setup.init();
		await setup.raw(["config", "user.email", "test@example.com"]);
		await setup.raw(["config", "user.name", "test"]);
		await setup.raw(["config", "commit.gpgsign", "false"]);
		await writeFile(join(repo, "café.txt"), "un\n");
		await setup.raw(["add", "--", "café.txt"]);
		await setup.raw(["commit", "-m", "initial"]);
		await writeFile(join(repo, "café.txt"), "un\ndeux\n");
		await mkdir(join(repo, "日本語"), { recursive: true });
		await writeFile(join(repo, "日本語", "файл.txt"), "три\n");

		const env = await createGitEnvResolver(
			providerWithEnv(process.env as Record<string, string>),
		)(repo);
		const { snapshot } = await getGitStatusSnapshot({
			git: createUserSimpleGit(repo).env(env),
			worktreePath: repo,
		});

		expect(env.LC_ALL).toBe("C");
		const paths = snapshot.unstaged.map((file) => file.path);
		expect(paths).toContain("café.txt");
		expect(paths).toContain("日本語/файл.txt");
	});
});
