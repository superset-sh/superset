import type { ChangedFile } from "shared/changes-types";
import type { SimpleGit } from "simple-git";
import { parseDiffNumstat } from "./parse-status";

export async function applyNumstatToFiles(
	git: SimpleGit,
	files: ChangedFile[],
	diffArgs: string[],
): Promise<void> {
	if (files.length === 0) return;

	try {
		const numstat = await git.raw(diffArgs);
		const stats = parseDiffNumstat(numstat);

		for (const file of files) {
			const fileStat = stats.get(file.path);
			if (fileStat) {
				file.additions = fileStat.additions;
				file.deletions = fileStat.deletions;
			}
		}
	} catch {}
}
