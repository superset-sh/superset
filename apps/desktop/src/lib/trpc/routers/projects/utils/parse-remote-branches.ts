/**
 * Parses the output of:
 *   git for-each-ref --sort=-committerdate
 *     --format=%(refname:short) %(committerdate:unix)
 *     refs/remotes/origin/
 *
 * Each line is "<refname:short> <unix-timestamp>".
 * The refname is either "origin/<branch>" for real branches or the bare
 * string "origin" when git collapses the symbolic HEAD ref
 * (refs/remotes/origin/HEAD → %(refname:short) = "origin").
 *
 * Returns entries only for real branches, stripping the "origin/" prefix.
 */
export function parseRemoteBranchLines(
	rawOutput: string,
): Array<{ branch: string; lastCommitDate: number }> {
	const result: Array<{ branch: string; lastCommitDate: number }> = [];

	for (const line of rawOutput.trim().split("\n")) {
		if (!line) continue;

		const lastSpaceIdx = line.lastIndexOf(" ");
		let branch = line.substring(0, lastSpaceIdx);
		const timestamp = Number.parseInt(line.substring(lastSpaceIdx + 1), 10);

		// Skip bare remote name (e.g. "origin" emitted for refs/remotes/origin/HEAD)
		if (!branch.startsWith("origin/")) continue;

		branch = branch.replace("origin/", "");

		// Extra safety: skip the HEAD pointer even if git emits "origin/HEAD"
		if (branch === "HEAD") continue;

		result.push({ branch, lastCommitDate: timestamp * 1000 });
	}

	return result;
}
