import {
	type FileContents,
	type FileDiffMetadata,
	parseDiffFromFile,
} from "@pierre/diffs";

type DiffFocusSide = "deletions" | "additions";
type DiffStyle = "split" | "unified";

interface GetRenderedDiffLineIndexOptions {
	oldFile: FileContents;
	newFile: FileContents;
	lineNumber: number;
	side?: DiffFocusSide;
	diffStyle: DiffStyle;
}

export function getRenderedDiffLineIndex({
	oldFile,
	newFile,
	lineNumber,
	side,
	diffStyle,
}: GetRenderedDiffLineIndexOptions): number | undefined {
	const diff = parseDiffFromFile(oldFile, newFile);
	const indexes = getRenderedDiffLineIndexes(diff, lineNumber, side);
	if (!indexes) return undefined;
	return diffStyle === "split" ? indexes.split : indexes.unified;
}

export function getRenderedDiffLineIndexes(
	fileDiff: Pick<FileDiffMetadata, "hunks">,
	lineNumber: number,
	side: DiffFocusSide = "additions",
): { unified: number; split: number } | undefined {
	const lastHunk = fileDiff.hunks.at(-1);
	let targetUnifiedIndex: number | undefined;
	let targetSplitIndex: number | undefined;

	hunkIterator: for (const hunk of fileDiff.hunks) {
		let currentLineNumber =
			side === "deletions" ? hunk.deletionStart : hunk.additionStart;
		const hunkCount =
			side === "deletions" ? hunk.deletionCount : hunk.additionCount;
		let splitIndex = hunk.splitLineStart;
		let unifiedIndex = hunk.unifiedLineStart;

		if (lineNumber < currentLineNumber) {
			const difference = currentLineNumber - lineNumber;
			targetUnifiedIndex = Math.max(unifiedIndex - difference, 0);
			targetSplitIndex = Math.max(splitIndex - difference, 0);
			break;
		}

		if (lineNumber >= currentLineNumber + hunkCount) {
			if (hunk === lastHunk) {
				const difference = lineNumber - (currentLineNumber + hunkCount);
				targetUnifiedIndex = unifiedIndex + hunk.unifiedLineCount + difference;
				targetSplitIndex = splitIndex + hunk.splitLineCount + difference;
				break;
			}
			continue;
		}

		for (const content of hunk.hunkContent) {
			if (content.type === "context") {
				if (lineNumber < currentLineNumber + content.lines) {
					const difference = lineNumber - currentLineNumber;
					targetSplitIndex = splitIndex + difference;
					targetUnifiedIndex = unifiedIndex + difference;
					break hunkIterator;
				}
				currentLineNumber += content.lines;
				splitIndex += content.lines;
				unifiedIndex += content.lines;
				continue;
			}

			const sideCount =
				side === "deletions" ? content.deletions : content.additions;
			if (lineNumber < currentLineNumber + sideCount) {
				const indexDifference = lineNumber - currentLineNumber;
				targetUnifiedIndex =
					unifiedIndex +
					(side === "additions" ? content.deletions : 0) +
					indexDifference;
				targetSplitIndex = splitIndex + indexDifference;
				break hunkIterator;
			}

			currentLineNumber += sideCount;
			splitIndex += Math.max(content.deletions, content.additions);
			unifiedIndex += content.deletions + content.additions;
		}

		break;
	}

	if (targetUnifiedIndex == null || targetSplitIndex == null) {
		return undefined;
	}

	return {
		unified: targetUnifiedIndex,
		split: targetSplitIndex,
	};
}
