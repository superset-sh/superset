#!/usr/bin/env bun

// Interim CLI release: bumps the CLI bundle (cli + host-service) to a prerelease
// under the current desktop version — e.g. 1.14.0-1, 1.14.0-2, ... These sort
// BELOW the desktop release, so the CLI never ships above desktop. Tags
// cli-v<version> to trigger release-cli.yml (which bundles host-service).
//
// pty-daemon stays on its OWN 0.x track and is only bumped with --daemon (a
// prerelease daemon would sort below desktop's bundled one and churn on the
// shared org socket). See plans/20260709-unified-version-bumping.md.
//
// Prefer `bun run release cli`. Usage: [suffix] [--daemon] [--no-tag]

import { $ } from "bun";
import {
	bumpDaemonPatch,
	DESKTOP_PACKAGE,
	fail,
	findWorkflowRun,
	green,
	guardDaemonBump,
	info,
	isPlainRelease,
	nextInterimVersion,
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
	let forceSuffix: number | undefined;
	let noTag = false;
	let withDaemon = false;
	for (const arg of argv) {
		if (arg === "--no-tag") noTag = true;
		else if (arg === "--daemon") withDaemon = true;
		else if (arg.startsWith("-"))
			fail(`Unknown option: ${arg}\nUsage: release cli [suffix] [--daemon] [--no-tag]`);
		else if (/^\d+$/.test(arg)) forceSuffix = Number(arg);
		else fail(`Suffix must be a positive integer, got: ${arg}`);
	}

	if (!Bun.which("gh")) fail("GitHub CLI (gh) is required but not installed.");

	const root = await repoRoot();
	process.chdir(root);

	const desktop = readVersion(root, DESKTOP_PACKAGE);
	if (!isPlainRelease(desktop)) {
		fail(
			`Desktop version '${desktop}' is not a plain MAJOR.MINOR.PATCH release; cannot base a CLI prerelease on it.`,
		);
	}
	const cliCur = readVersion(root, "packages/cli");
	const newVersion = nextInterimVersion(desktop, cliCur, forceSuffix);
	const tag = `cli-v${newVersion}`;

	info(`Desktop version (ceiling): ${desktop}`);
	info(`Current CLI version:       ${cliCur}`);
	info(`New CLI bundle version:    ${green(newVersion)}`);
	console.log("");

	if ((await $`git rev-parse ${tag}`.nothrow().quiet()).exitCode === 0) {
		fail(`Tag ${tag} already exists. Pass a higher suffix or delete the tag first.`);
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
	const msg = `chore(cli): release ${newVersion} (cli + host-service ${cliCur} -> ${newVersion}${daemonMsg})`;
	await $`git commit -m ${msg}`;
	success(`Committed ${cliCur} -> ${newVersion}${daemonMsg}`);

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
			const body = `Interim CLI release ${newVersion} (cli + host-service). Under desktop ${desktop}.\n\nCreated by scripts/release-tools/cli.ts.`;
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
		console.log(`  Check: https://github.com/${repo}/actions/workflows/release-cli.yml`);
	} else {
		console.log(`  https://github.com/${repo}/actions/runs/${runId}`);
		await $`gh run watch ${runId}`.nothrow();
	}
	console.log("");
	success(`CLI release ${newVersion} initiated`);
}

if (import.meta.main) await runCli(process.argv.slice(2));
