import { parsePatchFiles } from "@pierre/diffs";
import type { PullRequestDiff } from "@superset/shared/pull-request-diff";

export function parsePullRequestPatch({ patch, files }: PullRequestDiff) {
	const parsed = patch.trim()
		? parsePatchFiles(patch, undefined, false).flatMap((result) => result.files)
		: [];
	if (!files) return parsed;
	if (files.length !== parsed.length)
		throw new Error(
			"GitHub diff file metadata does not match the parsed patch",
		);
	return parsed.map((file, index) => {
		const metadata = files[index];
		if (
			!metadata ||
			(metadata.status === "renamed" && !metadata.previousFilename)
		)
			throw new Error("Missing GitHub diff file metadata");
		return {
			...file,
			name: metadata.filename,
			prevName:
				metadata.status === "renamed" ? metadata.previousFilename : undefined,
			type:
				metadata.status === "added"
					? ("new" as const)
					: metadata.status === "removed"
						? ("deleted" as const)
						: metadata.status === "renamed"
							? file.hunks.length
								? ("rename-changed" as const)
								: ("rename-pure" as const)
							: ("change" as const),
		};
	});
}
