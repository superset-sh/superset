import { afterEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import {
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	GIT_LFS_DISABLE_CONFIG_ARGS,
	getGitLfsConfigArgs,
	isGitLfsAvailable,
	resetGitLfsCache,
} from "./git-client";

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-lfs-${process.pid}`,
);

function createTestRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	execSync("git init", { cwd: repoPath, stdio: "ignore" });
	execSync("git config user.email 'test@test.com'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	execSync("git config user.name 'Test'", { cwd: repoPath, stdio: "ignore" });
	return repoPath;
}

afterEach(() => {
	resetGitLfsCache();
	try {
		rmSync(TEST_DIR, { recursive: true, force: true });
	} catch {}
});

describe("isGitLfsAvailable", () => {
	test("returns a boolean indicating whether git-lfs is installed", async () => {
		const result = await isGitLfsAvailable();
		expect(typeof result).toBe("boolean");
	});

	test("caches the result across calls", async () => {
		const first = await isGitLfsAvailable();
		const second = await isGitLfsAvailable();
		expect(first).toBe(second);
	});

	test("resetGitLfsCache clears the cached value", async () => {
		await isGitLfsAvailable();
		resetGitLfsCache();
		// After reset, calling again should re-check (no error = cache was cleared)
		const result = await isGitLfsAvailable();
		expect(typeof result).toBe("boolean");
	});
});

describe("getGitLfsConfigArgs", () => {
	test("returns empty array when git-lfs is available", async () => {
		// Check if git-lfs is actually installed in this CI environment
		let lfsInstalled = false;
		try {
			execSync("git lfs version", { stdio: "ignore" });
			lfsInstalled = true;
		} catch {}

		const args = await getGitLfsConfigArgs();
		if (lfsInstalled) {
			expect(args).toEqual([]);
		} else {
			expect(args).toEqual(GIT_LFS_DISABLE_CONFIG_ARGS);
		}
	});
});

describe("GIT_LFS_DISABLE_CONFIG_ARGS", () => {
	test("contains the correct git config flags to disable LFS filters", () => {
		expect(GIT_LFS_DISABLE_CONFIG_ARGS).toEqual([
			"-c",
			"filter.lfs.smudge=",
			"-c",
			"filter.lfs.process=",
			"-c",
			"filter.lfs.required=false",
		]);
	});
});

describe("git clone with LFS filter disabled", () => {
	test("clone succeeds with LFS-disabled config when repo has .gitattributes with LFS entries", async () => {
		mkdirSync(TEST_DIR, { recursive: true });

		// Create a "remote" repo that has LFS-style .gitattributes
		const remoteRepo = createTestRepo("remote-lfs");
		writeFileSync(
			join(remoteRepo, ".gitattributes"),
			"*.bin filter=lfs diff=lfs merge=lfs -text\n",
		);
		writeFileSync(join(remoteRepo, "README.md"), "# test\n");
		execSync("git add . && git commit -m 'init with lfs attributes'", {
			cwd: remoteRepo,
			stdio: "ignore",
		});

		// Configure a fake LFS filter in the repo that would fail if invoked
		// This simulates having `git lfs install` entries without the binary
		execSync(
			'git config filter.lfs.smudge "git-lfs-nonexistent smudge -- %f"',
			{ cwd: remoteRepo, stdio: "ignore" },
		);
		execSync(
			'git config filter.lfs.process "git-lfs-nonexistent filter-process"',
			{ cwd: remoteRepo, stdio: "ignore" },
		);
		execSync("git config filter.lfs.required true", {
			cwd: remoteRepo,
			stdio: "ignore",
		});

		const clonePath = join(TEST_DIR, "clone-with-lfs-disabled");

		// Clone WITH the disable flags - should succeed
		execSync(
			`git ${GIT_LFS_DISABLE_CONFIG_ARGS.join(" ")} clone "${remoteRepo}" "${clonePath}"`,
			{ stdio: "ignore" },
		);

		// Verify clone succeeded
		const readme = readFileSync(join(clonePath, "README.md"), "utf8");
		expect(readme).toBe("# test\n");
	});

	test("clone FAILS when global gitconfig has a broken LFS filter and repo uses LFS", () => {
		mkdirSync(TEST_DIR, { recursive: true });

		// Create a "remote" repo with .gitattributes referencing the LFS filter
		const remoteRepo = createTestRepo("remote-lfs-broken");
		writeFileSync(
			join(remoteRepo, ".gitattributes"),
			"*.bin filter=lfs diff=lfs merge=lfs -text\n",
		);
		// Create a .bin file that triggers the LFS smudge filter on checkout
		writeFileSync(join(remoteRepo, "data.bin"), "binary content\n");
		writeFileSync(join(remoteRepo, "README.md"), "# test\n");
		execSync("git add . && git commit -m 'init with lfs attributes'", {
			cwd: remoteRepo,
			stdio: "ignore",
		});

		const clonePath = join(TEST_DIR, "clone-broken-lfs");

		// Simulate a user whose global gitconfig has `git lfs install` entries
		// pointing to a nonexistent binary. Pass via `-c` to the clone command
		// to replicate what happens when the global gitconfig has these entries.
		expect(() => {
			execSync(
				`git -c filter.lfs.smudge="git-lfs-nonexistent smudge -- %f" ` +
					`-c filter.lfs.process="git-lfs-nonexistent filter-process" ` +
					`-c filter.lfs.required=true ` +
					`clone "${remoteRepo}" "${clonePath}"`,
				{ stdio: "pipe" },
			);
		}).toThrow();
	});

	test("clone succeeds with LFS-disabled config overriding broken global LFS filter", () => {
		mkdirSync(TEST_DIR, { recursive: true });

		const remoteRepo = createTestRepo("remote-lfs-override");
		writeFileSync(
			join(remoteRepo, ".gitattributes"),
			"*.bin filter=lfs diff=lfs merge=lfs -text\n",
		);
		writeFileSync(join(remoteRepo, "data.bin"), "binary content\n");
		writeFileSync(join(remoteRepo, "README.md"), "# test\n");
		execSync("git add . && git commit -m 'init with lfs attributes'", {
			cwd: remoteRepo,
			stdio: "ignore",
		});

		const clonePath = join(TEST_DIR, "clone-override-lfs");

		// Simulate broken global LFS config, but ALSO pass our disable flags.
		// The disable flags (passed later) override the broken ones.
		execSync(
			`git -c filter.lfs.smudge="git-lfs-nonexistent smudge -- %f" ` +
				`-c filter.lfs.process="git-lfs-nonexistent filter-process" ` +
				`-c filter.lfs.required=true ` +
				`${GIT_LFS_DISABLE_CONFIG_ARGS.join(" ")} ` +
				`clone "${remoteRepo}" "${clonePath}"`,
			{ stdio: "ignore" },
		);

		const readme = readFileSync(join(clonePath, "README.md"), "utf8");
		expect(readme).toBe("# test\n");
	});
});
