#!/usr/bin/env bun

// Desktop app release: bumps desktop + host-service + cli to one unified version
// (and, with --daemon, patch-bumps pty-daemon), tags desktop-v<version> to
// trigger release-desktop.yml, monitors the build, and leaves a draft (or
// publishes with --publish). See plans/20260709-unified-version-bumping.md and
// apps/desktop/RELEASE.md.
//
// Usage: [version] [commit] [--publish] [--merge] [--daemon]

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import {
	bumpDaemonPatch,
	fail,
	findWorkflowRun,
	green,
	guardDaemonBump,
	incrementMajor,
	incrementMinor,
	incrementPatch,
	info,
	readVersion,
	refreshLockfile,
	releaseDiffReport,
	repoRoot,
	repoSlug,
	sleep,
	success,
	syncUnified,
	warn,
	writeVersion,
} from "./lib.ts";

const DESKTOP_DIR = "apps/desktop";
const PLAIN = /^\d+\.\d+\.\d+$/;

/** Agents run non-interactively (no TTY); prompts must be skippable via flags. */
function isInteractive(): boolean {
	return Boolean(process.stdin.isTTY);
}

async function exitCode(p: ReturnType<typeof $>): Promise<number> {
	return (await p.nothrow().quiet()).exitCode;
}

async function tagExists(ref: string): Promise<boolean> {
	return (await exitCode($`git rev-parse ${ref}`)) === 0;
}

export async function runDesktop(argv: string[]): Promise<void> {
	let version = "";
	let commitInput = "";
	let autoPublish = false;
	let autoMerge = false;
	let withDaemon = false;
	let republish = false;
	for (const arg of argv) {
		if (arg === "--publish") autoPublish = true;
		else if (arg === "--merge") autoMerge = true;
		else if (arg === "--daemon") withDaemon = true;
		else if (arg === "--republish" || arg === "--yes" || arg === "-y")
			republish = true;
		else if (arg.startsWith("-"))
			fail(
				`Unknown option: ${arg}\nUsage: release desktop [version] [commit] [--publish] [--merge] [--daemon] [--republish]`,
			);
		else if (!version) version = arg;
		else if (!commitInput) commitInput = arg;
		else fail(`Unexpected argument: ${arg}`);
	}

	if (!Bun.which("gh")) fail("GitHub CLI (gh) is required but not installed.");

	const root = await repoRoot();
	process.chdir(root);
	if (!existsSync("package.json") || !existsSync("apps/desktop")) {
		fail("Please run this from the monorepo root directory.");
	}

	if (!version) {
		if (!isInteractive()) {
			fail(
				"No version provided and not running interactively. Pass a version: release desktop <version>",
			);
		}
		version = await promptVersion(root);
	}
	if (!PLAIN.test(version)) {
		fail(
			`Invalid version format: ${version}\nExpected MAJOR.MINOR.PATCH (e.g. 1.2.3). To release a specific commit: release desktop <version> <commit>`,
		);
	}
	if (autoMerge && commitInput) {
		warn("--merge has no effect with a commit SHA (no PR is created).");
	}

	if ((await exitCode($`gh auth status`)) !== 0) {
		fail("Not authenticated with GitHub CLI. Run: gh auth login");
	}

	const tag = `desktop-v${version}`;
	info(`Starting release process for version ${version}`);
	console.log("");

	await handleExistingTag(tag, republish);

	let prNumber = "";
	if (commitInput) {
		await releaseFromCommit(version, commitInput, tag, withDaemon);
	} else {
		prNumber = (await releaseFromHead(root, version, tag, withDaemon)).prNumber;
	}

	await monitorAndPublish(root, tag, { autoPublish, autoMerge, prNumber });
}

async function promptVersion(root: string): Promise<string> {
	const latest = (
		await $`gh release list --json tagName --jq ${'[.[] | select(.tagName | startswith("desktop-v"))] | .[0].tagName'}`
			.nothrow()
			.text()
	).trim();
	const current = latest
		? latest.replace(/^desktop-v/, "")
		: readVersion(root, DESKTOP_DIR);
	const patch = incrementPatch(current);
	const minor = incrementMinor(current);
	const major = incrementMajor(current);

	console.log("");
	console.log(`Current version: ${current}`);
	console.log("");
	console.log("Select the new version:");
	console.log(`  1) Patch  ${green(patch)} (bug fixes)`);
	console.log(`  2) Minor  ${green(minor)} (new features)`);
	console.log(`  3) Major  ${green(major)} (breaking changes)`);
	console.log("  4) Custom (enter manually)");
	console.log("");
	const choice = prompt("Enter choice [1-4]:");
	switch (choice) {
		case "1":
			return patch;
		case "2":
			return minor;
		case "3":
			return major;
		case "4": {
			const v = prompt("Enter version (e.g. 1.2.3):") ?? "";
			if (!PLAIN.test(v))
				fail("Invalid version format. Expected MAJOR.MINOR.PATCH.");
			return v;
		}
		default:
			return fail("Invalid choice. Please enter 1, 2, 3, or 4.");
	}
}

async function handleExistingTag(
	tag: string,
	republish: boolean,
): Promise<void> {
	info(`Checking if tag ${tag} already exists...`);
	if (!(await tagExists(tag))) {
		success(`Tag ${tag} is available`);
		return;
	}
	warn(`Tag ${tag} already exists!`);
	if (!republish) {
		if (!isInteractive()) {
			fail(
				`Tag ${tag} exists. Pass --republish to delete and recreate it, or choose a new version.`,
			);
		}
		const choice = prompt(
			"1) Republish (delete + recreate)  2) Cancel  [1-2]:",
		);
		if (choice !== "1") {
			info("Cancelled. No changes made.");
			process.exit(0);
		}
	}
	if ((await exitCode($`gh release view ${tag}`)) === 0) {
		await $`gh release delete ${tag} --yes`.nothrow();
		success("Deleted existing release");
	}
	await $`git push origin --delete ${tag}`.nothrow().quiet();
	await $`git tag -d ${tag}`.nothrow().quiet();
	success("Deleted existing tag");
}

/** Bump host-service + cli (+ daemon) to the unified version and commit. */
async function bumpUnified(
	root: string,
	version: string,
	withDaemon: boolean,
	stream: "desktop",
): Promise<{ message: string; daemonAdd: string[] }> {
	info("Diffing against the previous release...");
	await releaseDiffReport(root, stream);
	await guardDaemonBump(
		root,
		withDaemon,
		"Re-run with --daemon, or ship the daemon change via 'bun run release cli --daemon'.",
	);

	const hostOld = readVersion(root, "packages/host-service");
	const cliOld = readVersion(root, "packages/cli");
	await syncUnified(root, version);

	let daemonMsg = "";
	const daemonAdd: string[] = [];
	if (withDaemon) {
		const { old, next } = await bumpDaemonPatch(root);
		daemonMsg = `, pty-daemon ${old} -> ${next}`;
		daemonAdd.push("packages/pty-daemon/package.json");
	}
	await refreshLockfile(root);
	return {
		message: `host-service ${hostOld} -> ${version}, cli ${cliOld} -> ${version}${daemonMsg}`,
		daemonAdd,
	};
}

async function releaseFromHead(
	root: string,
	version: string,
	tag: string,
	withDaemon: boolean,
): Promise<{ prNumber: string; branch: string }> {
	const current = readVersion(root, DESKTOP_DIR);
	if (current !== version) {
		await writeVersion(root, DESKTOP_DIR, version);
		const { message, daemonAdd } = await bumpUnified(
			root,
			version,
			withDaemon,
			"desktop",
		);
		await $`git add ${`${DESKTOP_DIR}/package.json`} packages/host-service/package.json packages/cli/package.json ${daemonAdd} bun.lock`;
		await $`git commit -m ${`chore(desktop): bump version to ${version} (${message})`}`;
		success(`Committed version bump (${message})`);
	} else {
		warn(`apps/desktop already at version ${version}`);
	}

	const branch = (await $`git branch --show-current`.text()).trim();
	info(`Pushing ${branch}...`);
	await $`git push -u origin ${`HEAD:${branch}`}`;

	let prNumber = "";
	if (branch !== "main") {
		const existing = (
			await $`gh pr list --head ${branch} --json number --jq ${".[0].number"}`
				.nothrow()
				.text()
		).trim();
		if (existing) {
			prNumber = existing;
		} else if (
			Number(
				(await $`git rev-list --count ${"main..HEAD"}`.nothrow().text()).trim(),
			) > 0
		) {
			const r =
				await $`gh pr create --title ${`chore(desktop): bump version to ${version}`} --body ${"Automated by scripts/release/desktop.ts."} --base main --head ${branch}`
					.nothrow()
					.text();
			const m = r.match(/\/(\d+)\s*$/);
			if (m) {
				prNumber = m[1];
				success(`PR #${prNumber} created`);
			} else warn("Could not create PR");
		}
	}

	info(`Creating tag ${tag}...`);
	await $`git tag ${tag}`;
	await $`git push origin ${tag}`;
	success("Tag pushed to remote");
	return { prNumber, branch };
}

async function releaseFromCommit(
	version: string,
	commitInput: string,
	tag: string,
	withDaemon: boolean,
): Promise<void> {
	const fullSha = (
		await $`git rev-parse --verify ${`${commitInput}^{commit}`}`
			.nothrow()
			.text()
	).trim();
	if (!fullSha) fail(`Could not resolve commit: ${commitInput}`);
	const shortSha = fullSha.slice(0, 9);
	const tempBranch = `release-desktop-v${version}-${shortSha}`;
	info(`Releasing from commit ${shortSha} via temp branch ${tempBranch}`);

	await $`git push origin --delete ${tempBranch}`.nothrow().quiet();

	const worktree = mkdtempSync(join(tmpdir(), "superset-release-"));
	try {
		await $`git worktree add --detach ${worktree} ${fullSha}`.quiet();
		success(`Provisioned worktree at ${worktree}`);

		const wtVersion = readVersion(worktree, DESKTOP_DIR);
		if (wtVersion !== version) {
			await writeVersion(worktree, DESKTOP_DIR, version);
			const { message, daemonAdd } = await bumpUnified(
				worktree,
				version,
				withDaemon,
				"desktop",
			);
			await $`git add ${`${DESKTOP_DIR}/package.json`} packages/host-service/package.json packages/cli/package.json ${daemonAdd} bun.lock`.cwd(
				worktree,
			);
			await $`git commit -m ${`chore(desktop): bump version to ${version} (${message})`}`.cwd(
				worktree,
			);
			success(`Committed ${wtVersion} -> ${version} on top of ${shortSha}`);
		} else {
			warn(`Commit ${shortSha} already has version ${version}; skipping bump`);
		}

		await $`git push origin ${`HEAD:refs/heads/${tempBranch}`}`.cwd(worktree);
		await $`git tag ${tag}`.cwd(worktree);
		await $`git push origin ${tag}`.cwd(worktree);
		success(`Tag ${tag} pushed from temp branch`);
	} finally {
		await $`git worktree remove --force ${worktree}`.nothrow().quiet();
		rmSync(worktree, { recursive: true, force: true });
	}
}

async function monitorAndPublish(
	root: string,
	tag: string,
	opts: { autoPublish: boolean; autoMerge: boolean; prNumber: string },
): Promise<void> {
	const repo = await repoSlug(root);
	console.log("");
	success("Release process initiated!");

	const sha = (await $`git rev-list -n 1 ${tag}`.text()).trim();
	info("Monitoring GitHub Actions workflow...");
	const runId = await findWorkflowRun(root, "release-desktop.yml", sha);
	if (!runId) {
		warn("Could not find workflow run automatically.");
		console.log(`  https://github.com/${repo}/actions`);
	} else {
		console.log(`  https://github.com/${repo}/actions/runs/${runId}`);
		await $`gh run watch ${runId}`.nothrow();
		const conclusion = (
			await $`gh run view ${runId} --json conclusion --jq ${".conclusion"}`
				.nothrow()
				.text()
		).trim();
		if (conclusion === "success") success("Workflow completed successfully!");
		else if (conclusion === "failure")
			fail(`Workflow failed: https://github.com/${repo}/actions/runs/${runId}`);
		else warn(`Workflow ended with status: ${conclusion}`);
	}

	info("Waiting for draft release...");
	let found = false;
	for (let i = 0; i < 10 && !found; i++) {
		await sleep(3000);
		const r = await $`gh release view ${tag} --json tagName --jq ${".tagName"}`
			.nothrow()
			.quiet();
		found = r.exitCode === 0;
	}
	const url = `https://github.com/${repo}/releases/tag/${tag}`;
	if (!found) {
		warn(`Release not found yet — check ${url}`);
		return;
	}

	const version = tag.replace(/^desktop-v/, "");
	if (opts.autoPublish) {
		await $`gh release edit ${tag} --draft=false`;
		success("Release published!");
		info(
			`release-cli-lockstep.yml will tag cli-v${version} and ship the matching standalone CLI.`,
		);
		if (opts.autoMerge && opts.prNumber) {
			const r =
				await $`gh pr merge ${opts.prNumber} --squash --delete-branch`.nothrow();
			if (r.exitCode === 0) success(`PR #${opts.prNumber} merged`);
			else warn(`Could not merge PR #${opts.prNumber}`);
		}
		console.log(`\nRelease: ${url}`);
	} else {
		success("Draft release created!");
		console.log(`\nReview: ${url}`);
		console.log(`Publish with: gh release edit ${tag} --draft=false`);
		console.log(
			`Publishing auto-tags cli-v${version} and ships the standalone CLI (release-cli-lockstep.yml).`,
		);
	}
}

if (import.meta.main) await runDesktop(process.argv.slice(2));
