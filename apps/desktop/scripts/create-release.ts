import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

interface Options {
	version: string;
	commit: string;
	publish: boolean;
	merge: boolean;
	dryRun: boolean;
}

const DESKTOP_DIR = "apps/desktop";

function usage(): void {
	console.log(`Usage: bun run apps/desktop/scripts/create-release.ts [version] [commit] [--publish] [--merge] [--dry-run]

Creates a desktop release tag and monitors the GitHub Actions release workflow.

Arguments:
  version    Optional semver version (MAJOR.MINOR.PATCH). Prompts if omitted.
  commit     Optional commit/ref to release from via a temporary branch.

Options:
  --publish  Publish the GitHub release after the workflow completes.
  --merge    Merge the version-bump PR after publish.
  --dry-run  Print mutating commands without writing files, pushing, or calling gh.
  --help     Show this help text.`);
}

function parseArgs(argv: string[]): Options {
	const options: Options = {
		version: "",
		commit: "",
		publish: false,
		merge: false,
		dryRun: false,
	};

	for (const arg of argv) {
		if (arg === "--help" || arg === "-h") {
			usage();
			process.exit(0);
		}
		if (arg === "--publish") {
			options.publish = true;
			continue;
		}
		if (arg === "--merge") {
			options.merge = true;
			continue;
		}
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg.startsWith("-")) {
			throw new Error(`Unknown option: ${arg}`);
		}
		if (!options.version) {
			options.version = arg;
			continue;
		}
		if (!options.commit) {
			options.commit = arg;
			continue;
		}
		throw new Error(`Unexpected argument: ${arg}`);
	}

	return options;
}

function run(
	command: string,
	args: string[],
	opts: {
		cwd?: string;
		dryRun?: boolean;
		capture?: boolean;
		allowFailure?: boolean;
	} = {},
): string {
	const printable = [command, ...args].join(" ");
	if (opts.dryRun) {
		console.log(`[dry-run] ${printable}`);
		return "";
	}
	const result = spawnSync(command, args, {
		cwd: opts.cwd,
		encoding: "utf-8",
		stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
	});
	if (result.error) {
		if (opts.allowFailure) return "";
		throw new Error(`${command} failed: ${result.error.message}`);
	}
	if (result.status !== 0) {
		if (opts.allowFailure) return "";
		const stderr = result.stderr?.trim();
		throw new Error(
			`${command} exited with code ${result.status}${stderr ? `: ${stderr}` : ""}`,
		);
	}
	return result.stdout?.trim() ?? "";
}

function readJson<T>(filePath: string): T {
	return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function writeJson(filePath: string, value: unknown, dryRun: boolean): void {
	if (dryRun) {
		console.log(`[dry-run] write ${filePath}`);
		return;
	}
	writeFileSync(filePath, `${JSON.stringify(value, null, "\t")}\n`);
}

function assertRepoRoot(cwd: string): void {
	if (
		!existsSync(join(cwd, "package.json")) ||
		!existsSync(join(cwd, DESKTOP_DIR))
	) {
		throw new Error("Please run this script from the monorepo root directory");
	}
}

function isSemver(version: string): boolean {
	return /^\d+\.\d+\.\d+$/.test(version);
}

function increment(version: string, part: "patch" | "minor" | "major"): string {
	const [major, minor, patch] = version.split(".").map(Number);
	if (part === "major") return `${major + 1}.0.0`;
	if (part === "minor") return `${major}.${minor + 1}.0`;
	return `${major}.${minor}.${patch + 1}`;
}

async function promptVersion(currentVersion: string): Promise<string> {
	const patch = increment(currentVersion, "patch");
	const minor = increment(currentVersion, "minor");
	const major = increment(currentVersion, "major");
	console.log(`\nCurrent version: ${currentVersion}\n`);
	console.log(`Select the new version:`);
	console.log(`  1) Patch  ${patch}`);
	console.log(`  2) Minor  ${minor}`);
	console.log(`  3) Major  ${major}`);
	console.log(`  4) Custom`);
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const choice = (await rl.question("\nEnter choice [1-4]: ")).trim();
		if (choice === "1") return patch;
		if (choice === "2") return minor;
		if (choice === "3") return major;
		if (choice === "4") {
			const custom = (
				await rl.question("Enter version (e.g., 1.2.3): ")
			).trim();
			if (!isSemver(custom)) {
				throw new Error("Invalid version format. Expected MAJOR.MINOR.PATCH.");
			}
			return custom;
		}
		throw new Error("Invalid choice. Please enter 1, 2, 3, or 4.");
	} finally {
		rl.close();
	}
}

function getLatestDesktopVersion(dryRun: boolean): string {
	if (!dryRun) {
		const releases = run(
			"gh",
			["release", "list", "--json", "tagName", "--limit", "100"],
			{ capture: true, allowFailure: true },
		);
		if (releases) {
			const tags = (JSON.parse(releases) as Array<{ tagName?: string }>)
				.map((release) => release.tagName ?? "")
				.filter((tag) => tag.startsWith("desktop-v"));
			const latest = tags[0];
			if (latest) return latest.replace(/^desktop-v/, "");
		}
	}
	const pkg = readJson<{ version: string }>(join(DESKTOP_DIR, "package.json"));
	return pkg.version;
}

function updatePackageVersion(
	filePath: string,
	version: string,
	dryRun: boolean,
): string {
	const pkg = readJson<{ version: string } & Record<string, unknown>>(filePath);
	const oldVersion = pkg.version;
	if (oldVersion !== version) {
		pkg.version = version;
		writeJson(filePath, pkg, dryRun);
		run("bun", ["x", "@biomejs/biome@2.4.2", "format", "--write", filePath], {
			dryRun,
		});
	}
	return oldVersion;
}

function bumpHostServicePatch(
	repoRoot: string,
	dryRun: boolean,
): { oldVersion: string; newVersion: string } {
	const filePath = join(repoRoot, "packages/host-service/package.json");
	const pkg = readJson<{ version: string } & Record<string, unknown>>(filePath);
	const oldVersion = pkg.version;
	const newVersion = increment(oldVersion, "patch");
	pkg.version = newVersion;
	writeJson(filePath, pkg, dryRun);
	run("bun", ["x", "@biomejs/biome@2.4.2", "format", "--write", filePath], {
		dryRun,
	});
	return { oldVersion, newVersion };
}

function remoteRepoSlug(): string {
	const url = run("git", ["remote", "get-url", "origin"], { capture: true });
	const match = /github\.com[:/](.+?)(?:\.git)?$/.exec(url);
	return match?.[1] ?? "superset-sh/superset";
}

function ensurePrereqs(dryRun: boolean): void {
	run("gh", ["--version"], { dryRun, capture: true });
	run("gh", ["auth", "status"], { dryRun, capture: true });
}

function cleanupExistingTag(tagName: string, dryRun: boolean): void {
	if (dryRun) {
		console.log(`[dry-run] check local tag ${tagName}`);
		return;
	}
	const localTag = run("git", ["rev-parse", tagName], {
		capture: true,
		allowFailure: true,
	});
	if (!localTag) return;
	throw new Error(
		`Tag ${tagName} already exists locally. Delete it or use the Bash release script's republish flow before retrying.`,
	);
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const repoRoot =
		run("git", ["rev-parse", "--show-toplevel"], {
			capture: true,
			allowFailure: options.dryRun,
		}) || process.cwd();
	process.chdir(repoRoot);
	assertRepoRoot(repoRoot);

	if (!options.version) {
		options.version = await promptVersion(
			getLatestDesktopVersion(options.dryRun),
		);
	}
	if (!isSemver(options.version)) {
		throw new Error(
			`Invalid version format: ${options.version}. Expected MAJOR.MINOR.PATCH.`,
		);
	}

	if (options.merge && options.commit) {
		console.warn(
			"--merge has no effect with a commit SHA; no PR is created for commit-based releases.",
		);
	}

	ensurePrereqs(options.dryRun);

	const tagName = `desktop-v${options.version}`;
	cleanupExistingTag(tagName, options.dryRun);
	console.log(`Starting desktop release ${tagName}`);

	let currentBranch = "";
	let prNumber = "";

	if (options.commit) {
		const fullSha =
			run("git", ["rev-parse", "--verify", `${options.commit}^{commit}`], {
				dryRun: options.dryRun,
				capture: true,
			}) || options.commit;
		const shortSha = fullSha.slice(0, 9);
		const tempBranch = `release-desktop-v${options.version}-${shortSha}`;
		currentBranch = tempBranch;
		const worktreeDir = options.dryRun
			? join(tmpdir(), `superset-release-dry-run-${shortSha}`)
			: mkdtempSync(join(tmpdir(), "superset-release-"));
		try {
			run("git", ["push", "origin", "--delete", tempBranch], {
				dryRun: options.dryRun,
				allowFailure: true,
			});
			run("git", ["worktree", "add", "--detach", worktreeDir, fullSha], {
				dryRun: options.dryRun,
			});
			const effectiveRoot = options.dryRun ? repoRoot : worktreeDir;
			const desktopPkg = join(effectiveRoot, DESKTOP_DIR, "package.json");
			const oldDesktop = updatePackageVersion(
				desktopPkg,
				options.version,
				options.dryRun,
			);
			const host = bumpHostServicePatch(effectiveRoot, options.dryRun);
			if (oldDesktop !== options.version) {
				run(
					"git",
					[
						"add",
						`${DESKTOP_DIR}/package.json`,
						"packages/host-service/package.json",
					],
					{
						cwd: worktreeDir,
						dryRun: options.dryRun,
					},
				);
				run(
					"git",
					[
						"commit",
						"-m",
						`chore(desktop): bump version to ${options.version} (host-service ${host.oldVersion} -> ${host.newVersion})`,
					],
					{ cwd: worktreeDir, dryRun: options.dryRun },
				);
			}
			run("git", ["push", "origin", `HEAD:refs/heads/${tempBranch}`], {
				cwd: worktreeDir,
				dryRun: options.dryRun,
			});
			run("git", ["tag", tagName], {
				cwd: worktreeDir,
				dryRun: options.dryRun,
			});
			run("git", ["push", "origin", tagName], {
				cwd: worktreeDir,
				dryRun: options.dryRun,
			});
		} finally {
			run("git", ["worktree", "remove", "--force", worktreeDir], {
				dryRun: options.dryRun,
				allowFailure: true,
			});
			if (!options.dryRun)
				rmSync(worktreeDir, { recursive: true, force: true });
		}
	} else {
		const oldDesktop = updatePackageVersion(
			join(DESKTOP_DIR, "package.json"),
			options.version,
			options.dryRun,
		);
		const host =
			oldDesktop === options.version
				? null
				: bumpHostServicePatch(repoRoot, options.dryRun);
		if (oldDesktop !== options.version && host) {
			run(
				"git",
				[
					"add",
					`${DESKTOP_DIR}/package.json`,
					"packages/host-service/package.json",
				],
				{
					dryRun: options.dryRun,
				},
			);
			run(
				"git",
				[
					"commit",
					"-m",
					`chore(desktop): bump version to ${options.version} (host-service ${host.oldVersion} -> ${host.newVersion})`,
				],
				{ dryRun: options.dryRun },
			);
		}
		currentBranch =
			run("git", ["branch", "--show-current"], {
				dryRun: options.dryRun,
				capture: true,
			}) || "current-branch";
		run("git", ["push", "-u", "origin", `HEAD:${currentBranch}`], {
			dryRun: options.dryRun,
		});

		if (currentBranch !== "main") {
			const existingPr = run(
				"gh",
				["pr", "list", "--head", currentBranch, "--json", "number"],
				{ dryRun: options.dryRun, capture: true, allowFailure: true },
			);
			const parsedPr = existingPr
				? (JSON.parse(existingPr) as Array<{ number?: number }>)[0]?.number
				: undefined;
			if (parsedPr) {
				prNumber = String(parsedPr);
			} else {
				const prUrl = run(
					"gh",
					[
						"pr",
						"create",
						"--title",
						`chore(desktop): bump version to ${options.version}`,
						"--body",
						`Bumps desktop app version to ${options.version}.\n\nThis PR was automatically created by the release script.`,
						"--base",
						"main",
						"--head",
						currentBranch,
					],
					{ dryRun: options.dryRun, capture: true, allowFailure: true },
				);
				prNumber = /(\d+)$/.exec(prUrl)?.[1] ?? "";
			}
		}

		run("git", ["tag", tagName], { dryRun: options.dryRun });
		run("git", ["push", "origin", tagName], { dryRun: options.dryRun });
	}

	const repo = options.dryRun ? "superset-sh/superset" : remoteRepoSlug();
	const tagSha =
		run("git", ["rev-list", "-n", "1", tagName], {
			dryRun: options.dryRun,
			capture: true,
		}) || "TAG_SHA";
	console.log(`Monitoring GitHub Actions workflow for ${tagName}`);
	let workflowRun = "";
	for (let attempt = 0; attempt < 6 && !workflowRun; attempt++) {
		if (!options.dryRun)
			await new Promise((resolve) => setTimeout(resolve, 5000));
		workflowRun = run(
			"gh",
			[
				"run",
				"list",
				"--workflow=release-desktop.yml",
				"--json",
				"databaseId,headSha,event",
				"--jq",
				`.[] | select(.headSha == "${tagSha}" and .event == "push") | .databaseId`,
			],
			{ dryRun: options.dryRun, capture: true, allowFailure: true },
		)
			.split("\n")[0]
			?.trim();
	}
	if (workflowRun) {
		console.log(
			`Workflow: https://github.com/${repo}/actions/runs/${workflowRun}`,
		);
		run("gh", ["run", "watch", workflowRun], {
			dryRun: options.dryRun,
			allowFailure: true,
		});
		const conclusion = run(
			"gh",
			[
				"run",
				"view",
				workflowRun,
				"--json",
				"conclusion",
				"--jq",
				".conclusion",
			],
			{ dryRun: options.dryRun, capture: true, allowFailure: true },
		);
		if (conclusion === "failure") {
			throw new Error(
				`Workflow failed: https://github.com/${repo}/actions/runs/${workflowRun}`,
			);
		}
	} else {
		console.warn(
			`Could not find workflow run automatically. Check https://github.com/${repo}/actions`,
		);
	}

	if (options.publish) {
		run("gh", ["release", "edit", tagName, "--draft=false"], {
			dryRun: options.dryRun,
		});
		if (options.merge && prNumber) {
			run("gh", ["pr", "merge", prNumber, "--squash", "--delete-branch"], {
				dryRun: options.dryRun,
			});
		}
		console.log(
			`Published: https://github.com/${repo}/releases/tag/${tagName}`,
		);
	} else {
		console.log(
			`Draft release should be available at https://github.com/${repo}/releases/tag/${tagName}`,
		);
	}
}

main().catch((error) => {
	console.error((error as Error).message);
	process.exit(1);
});
