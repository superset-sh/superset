import { createGitRunner, type GitRunner } from "./git-runner";

/**
 * Pack a capture for a transport that cannot negotiate.
 *
 * A `git fetch` between two live hosts works out what the other end is
 * missing by itself. A bundle has no such conversation, so the destination
 * sends its refs up front and they become negative revisions: everything
 * reachable from them is left out of the pack. That recovers fetch-grade
 * minimality for the parked case — a laptop that closed before the
 * destination ever woke up.
 *
 * The filter is the subtle half. A destination tip the *source* has never
 * heard of cannot be excluded from the source's pack, and naming it would
 * make `git bundle` fail outright, so unknown tips are dropped.
 */

export interface BundleHandoffInput {
	worktreePath: string;
	/** The capture's ref; the one positive revision in the bundle. */
	ref: string;
	/** Commits the destination already has, from `readDestinationBranch`. */
	destinationTips: readonly string[];
	outputPath: string;
	git?: GitRunner;
}

export async function bundleHandoff({
	worktreePath,
	ref,
	destinationTips,
	outputPath,
	git = createGitRunner(worktreePath),
}: BundleHandoffInput): Promise<void> {
	const known = await filterToKnownCommits(git, destinationTips);
	const revisions = [...known.map((tip) => `^${tip}`), ref].join("\n");
	await git.runWithInput(
		["bundle", "create", "-q", outputPath, "--stdin"],
		`${revisions}\n`,
	);
}

/**
 * Which tips this repository holds as commits — one `cat-file` pass over the
 * whole list rather than a spawn per tip.
 */
export async function filterToKnownCommits(
	git: GitRunner,
	tips: readonly string[],
): Promise<string[]> {
	const candidates = [...new Set(tips)].filter(isObjectId);
	if (candidates.length === 0) return [];

	const report = await git.runWithInput(
		["cat-file", "--batch-check=%(objectname) %(objecttype)"],
		`${candidates.join("\n")}\n`,
	);

	// A missing object reports `<name> missing`, so keeping only `commit`
	// rejects absent objects and non-commits (a tag tip, a tree) together.
	const known = new Set<string>();
	for (const line of report.split("\n")) {
		const [name, type] = line.trim().split(" ");
		if (type === "commit" && name) known.add(name);
	}
	return candidates.filter((tip) => known.has(tip));
}

function isObjectId(value: string): boolean {
	return /^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(value);
}
