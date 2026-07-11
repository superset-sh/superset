#!/usr/bin/env bun

// Interim CLI hotfix: ships a CLI-side fix BETWEEN desktop releases by bumping
// the CLI bundle (cli + host-service) a plain patch above the current CLI — e.g.
// desktop 1.14.1 → cli 1.14.2, 1.14.3. The CLI leads desktop by a patch until the
// next desktop release catches up. Tags cli-v<version> to trigger release-cli.yml
// (which bundles host-service).
//
// Plain versions (no prerelease suffix) on purpose: a suffix would sort BELOW the
// release (so `superset update` wouldn't deliver it) AND fail the host-service
// min-version floor (semver.satisfies excludes prereleases). See
// plans/20260709-unified-version-bumping.md.
//
// pty-daemon stays on its OWN 0.x track and is only bumped with --daemon.
//
// Prefer `bun run release cli`. Usage: [version] [--daemon] [--no-tag]

import { $ } from "bun";
import semver from "semver";
import {
	bumpDaemonPatch,
	DESKTOP_PACKAGE,
	fail,
	fetchTags,
	findWorkflowRun,
	green,
	guardDaemonBump,
	info,
	isPlainRelease,
	maxVersion,
	nextCliHotfix,
	previousReleaseTag,
	readVersion,
	refreshLockfile,
	releaseDiffReport,
	repoRoot,
	repoSlug,
	success,
	syncUnified,
	UNIFIED_PACKAGES,
	warn,
} from "./lib.ts";

export async function runCli(argv: string[]): Promise<void> {
	let explicitVersion: string | undefined;
	let noTag = false;
	let withDaemon = false;
	for (const arg of argv) {
		if (arg === "--no-tag") noTag = true;
		else if (arg === "--daemon") withDaemon = true;
		else if (arg.startsWith("-"))
			fail(
				`Unknown option: ${arg}\nUsage: release cli [version] [--daemon] [--no-tag]`,
			);
		else if (isPlainRelease(arg)) explicitVersion = arg;
		else fail(`Version must be a plain MAJOR.MINOR.PATCH, got: ${arg}`);
	}

	if (!Bun.which("gh")) fail("GitHub CLI (gh) is required but not installed.");

	const root = await repoRoot();
	process.chdir(root);

	const desktop = readVersion(root, DESKTOP_PACKAGE);
	if (!isPlainRelease(desktop)) {
		fail(
			`Desktop version '${desktop}' is not a plain MAJOR.MINOR.PATCH release.`,
		);
	}

	// The current CLI is the highest of package.json, the latest cli-v tag, and
	// desktop — so a hotfix never lands below what's already published. Fetch
	// tags first so the tag check uses published state, not stale local tags.
	await fetchTags(root);
	const cliPkg = readVersion(root, "packages/cli");
	const latestTag = await previousReleaseTag(root, "cli");
	const latestTagVer = latestTag ? latestTag.replace(/^cli-v/, "") : "0.0.0";
	const current = maxVersion([cliPkg, latestTagVer, desktop]);

	const newVersion = explicitVersion ?? nextCliHotfix(current);
	if (!semver.gt(newVersion, current)) {
		fail(
			`Version ${newVersion} must be greater than the current CLI ${current}.`,
		);
	}
	if (
		semver.major(newVersion) !== semver.major(desktop) ||
		semver.minor(newVersion) !== semver.minor(desktop)
	) {
		fail(
			`Version ${newVersion} must stay in desktop '${desktop}' minor line (a hotfix leads by patch). For a new minor/major, cut a desktop release.`,
		);
	}
	const tag = `cli-v${newVersion}`;

	info(`Desktop version:        ${desktop}`);
	info(`Current CLI (published): ${current}`);
	info(`New CLI hotfix version:  ${green(newVersion)}`);
	console.log("");

	if ((await $`git rev-parse ${tag}`.nothrow().quiet()).exitCode === 0) {
		fail(
			`Tag ${tag} already exists. Pass a higher version or delete the tag first.`,
		);
	}

	info("Diffing against the previous release...");
	await releaseDiffReport(root, "cli");
	await guardDaemonBump(root, withDaemon);

	info(`Setting ${UNIFIED_PACKAGES.join(" ")} to ${newVersion}...`);
	await syncUnified(root, newVersion);

	let daemonMsg = "";
	const daemonAdd: string[] = [];
	if (withDaemon) {
		const { old, next } = await bumpDaemonPatch(root);
		daemonMsg = `, pty-daemon ${old} -> ${next}`;
		daemonAdd.push("packages/pty-daemon/package.json");
		info(`Patch-bumped pty-daemon ${old} -> ${next}`);
	}

	await refreshLockfile(root);
	success("Versions written");

	const addPkgs = UNIFIED_PACKAGES.map((p) => `${p}/package.json`);
	await $`git add ${addPkgs} ${daemonAdd} bun.lock`;
	const msg = `chore(cli): release ${newVersion} (cli + host-service ${current} -> ${newVersion}${daemonMsg})`;
	await $`git commit -m ${msg}`;
	success(`Committed ${current} -> ${newVersion}${daemonMsg}`);

	if (noTag) {
		warn(
			`--no-tag: skipping push/tag. Commit is on your branch; push and tag ${tag} manually to release.`,
		);
		return;
	}

	const branch = (await $`git branch --show-current`.text()).trim();
	info(`Pushing ${branch}...`);
	await $`git push -u origin ${`HEAD:${branch}`}`;

	if (branch !== "main") {
		const existing = (
			await $`gh pr list --head ${branch} --json number --jq ${".[0].number"}`
				.nothrow()
				.text()
		).trim();
		if (!existing) {
			const body = `Interim CLI hotfix ${newVersion} (cli + host-service), a patch above desktop ${desktop}.\n\nCreated by scripts/release/cli.ts.`;
			const r =
				await $`gh pr create --title ${`chore(cli): release ${newVersion}`} --body ${body} --base main --head ${branch}`
					.nothrow()
					.quiet();
			if (r.exitCode === 0) success("PR created");
			else warn("Could not create PR");
		}
	}

	info(`Creating and pushing tag ${tag}...`);
	await $`git tag ${tag}`;
	await $`git push origin ${tag}`;
	success(`Tag ${tag} pushed — release-cli.yml will build and publish`);

	const repo = await repoSlug(root);
	const sha = (await $`git rev-list -n 1 ${tag}`.text()).trim();
	info("Locating release-cli.yml run...");
	const runId = await findWorkflowRun(root, "release-cli.yml", sha);
	if (!runId) {
		warn("Could not find the workflow run automatically.");
		console.log(
			`  Check: https://github.com/${repo}/actions/workflows/release-cli.yml`,
		);
	} else {
		console.log(`  https://github.com/${repo}/actions/runs/${runId}`);
		await $`gh run watch ${runId}`.nothrow();
	}
	console.log("");
	success(`CLI release ${newVersion} initiated`);
}

if (import.meta.main) await runCli(process.argv.slice(2));
