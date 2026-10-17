import {
	type FileDiffMetadata,
	parseDiffFromFile,
	parsePatchFiles,
} from "@pierre/diffs";
import { buildContentKey } from "renderer/routes/_authenticated/_dashboard/utils/buildContentKey";

export interface PatchGroupFile {
	path: string;
	oldPath?: string;
	oldFile: { name: string; contents: string };
	newFile: { name: string; contents: string };
}

/** `files` is the fallback for a host without `git.getDiffPatch`.
 * `requestedPaths` is what was asked for, not what came back;
 * `requestedUntrackedPaths` is the subset sent as `untrackedPaths`. */
export type PatchGroupResult = {
	requestedPaths: string[];
	requestedUntrackedPaths: string[];
} & (
	| { kind: "patch"; patch: string }
	| { kind: "files"; files: PatchGroupFile[] }
);

export interface ParsedPatchGroup {
	source: PatchGroupResult;
	byPath: ReadonlyMap<string, FileDiffMetadata>;
	bySegmentKey: ReadonlyMap<string, FileDiffMetadata>;
}

const SEGMENT_BOUNDARY = /^diff --git /gm;

export function splitPatchSegments(patch: string): string[] {
	const starts: number[] = [];
	for (const match of patch.matchAll(SEGMENT_BOUNDARY)) {
		starts.push(match.index);
	}
	if (starts.length <= 1) return patch.length > 0 ? [patch] : [];
	const segments: string[] = [];
	let start = 0;
	for (const boundary of starts.slice(1)) {
		segments.push(patch.slice(start, boundary));
		start = boundary;
	}
	segments.push(patch.slice(start));
	return segments;
}

export function parsePatchGroup(
	groupKey: string,
	result: PatchGroupResult,
	previous?: ParsedPatchGroup,
): ParsedPatchGroup {
	const byPath = new Map<string, FileDiffMetadata>();
	const bySegmentKey = new Map<string, FileDiffMetadata>();
	const keep = (key: string, parse: () => FileDiffMetadata | undefined) => {
		const fileDiff = previous?.bySegmentKey.get(key) ?? parse();
		if (!fileDiff) return;
		bySegmentKey.set(key, fileDiff);
		byPath.set(fileDiff.name, fileDiff);
		if (fileDiff.prevName) byPath.set(fileDiff.prevName, fileDiff);
	};

	if (result.kind === "patch") {
		for (const segment of splitPatchSegments(result.patch)) {
			const key = buildContentKey(groupKey, segment);
			keep(key, () => parsePatchFiles(segment, key)[0]?.files[0]);
		}
	} else {
		for (const file of result.files) {
			const oldName = file.oldPath ?? file.path;
			const key = buildContentKey(
				groupKey,
				[oldName, file.oldFile.contents, file.path, file.newFile.contents].join(
					"\0",
				),
			);
			keep(key, () =>
				parseDiffFromFile(
					{ ...file.oldFile, name: oldName, cacheKey: `${key}:old` },
					{ ...file.newFile, name: file.path, cacheKey: `${key}:new` },
				),
			);
		}
	}

	return { source: result, byPath, bySegmentKey };
}
