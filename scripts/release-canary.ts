import { spawnSync } from "node:child_process";

function usage(): void {
	console.log(`Usage: bun run scripts/release-canary.ts [commit] [--dry-run]

Triggers the release-desktop-canary GitHub Actions workflow.

Arguments:
  commit     Optional commit/ref to push to a temporary canary branch first.

Options:
  --dry-run  Print commands without running git/gh.
  --help     Show this help text.`);
}

function run(
	command: string,
	args: string[],
	options: { dryRun?: boolean; capture?: boolean } = {},
): string {
	const printable = [command, ...args].join(" ");
	if (options.dryRun) {
		console.log(`[dry-run] ${printable}`);
		return "";
	}

	const result = spawnSync(command, args, {
		encoding: "utf-8",
		stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
	});
	if (result.error) {
		throw new Error(`${command} failed: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(`${command} exited with code ${result.status}`);
	}
	return result.stdout?.trim() ?? "";
}

function parseArgs(argv: string[]): { commit: string; dryRun: boolean } {
	let commit = "";
	let dryRun = false;

	for (const arg of argv) {
		if (arg === "--help" || arg === "-h") {
			usage();
			process.exit(0);
		}
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (arg.startsWith("-")) {
			throw new Error(`Unknown option: ${arg}`);
		}
		if (commit) {
			throw new Error(`Unexpected argument: ${arg}`);
		}
		commit = arg;
	}

	return { commit, dryRun };
}

async function main(): Promise<void> {
	const { commit, dryRun } = parseArgs(process.argv.slice(2));
	const workflowArgs = [
		"workflow",
		"run",
		"release-desktop-canary.yml",
		"-f",
		"force_build=true",
	];

	if (commit) {
		const fullSha = run("git", ["rev-parse", commit], {
			dryRun,
			capture: true,
		});
		const branchSha = dryRun ? commit : fullSha;
		const tempBranch = `canary-release-${branchSha.slice(0, 9)}`;
		run("git", ["push", "origin", `${branchSha}:refs/heads/${tempBranch}`], {
			dryRun,
		});
		workflowArgs.push("--ref", tempBranch);
	}

	run("gh", workflowArgs, { dryRun });
	if (!dryRun) {
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	const url = run(
		"gh",
		[
			"run",
			"list",
			"--workflow=release-desktop-canary.yml",
			"--limit=1",
			"--json",
			"url",
			"-q",
			".[0].url",
		],
		{ dryRun, capture: true },
	);
	if (url) console.log(url);
}

main().catch((error) => {
	console.error((error as Error).message);
	process.exit(1);
});
