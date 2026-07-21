import type { FileDiffMetadata, SelectionSide } from "@pierre/diffs";

export interface DiffSearchEntry {
	itemId: string;
	changeKey: string;
	fileDiff: FileDiffMetadata;
}

export interface DiffSearchMatch {
	itemId: string;
	changeKey: string;
	side: SelectionSide;
	lineNumber: number;
	/** Zero-based occurrence of the query within this line's text, counted the
	 *  same way the DOM highlighter walks a rendered row (overlaps allowed). */
	occurrence: number;
}

interface CollectDiffSearchMatchesOptions {
	query: string;
	caseSensitive: boolean;
	/** Mirrors the CodeView `expandUnchanged` option: when set, whole files are
	 *  rendered, so unchanged lines outside hunks are searchable too. */
	expandUnchanged: boolean;
}

/**
 * Compute every match of `query` across the diff data itself, in the order the
 * lines appear in the rendered changeset. The CodeView virtualizes its rows,
 * so DOM-based searching only ever sees the mounted viewport — this walks the
 * parsed hunks instead and stays stable while scrolling.
 */
export function collectDiffSearchMatches(
	entries: readonly DiffSearchEntry[],
	options: CollectDiffSearchMatchesOptions,
): DiffSearchMatch[] {
	if (!options.query) return [];

	const needle = options.caseSensitive
		? options.query
		: options.query.toLowerCase();
	const matches: DiffSearchMatch[] = [];

	for (const entry of entries) {
		const { fileDiff } = entry;
		const emitLine = (
			text: string,
			side: SelectionSide,
			lineNumber: number,
		) => {
			const haystack = options.caseSensitive ? text : text.toLowerCase();
			let fromIndex = 0;
			let occurrence = 0;
			while (true) {
				const at = haystack.indexOf(needle, fromIndex);
				if (at === -1) break;
				matches.push({
					itemId: entry.itemId,
					changeKey: entry.changeKey,
					side,
					lineNumber,
					occurrence,
				});
				occurrence += 1;
				fromIndex = at + 1;
			}
		};

		const includeUnchanged = options.expandUnchanged && !fileDiff.isPartial;
		// Next addition-side line to emit when unchanged regions are rendered.
		let expandedLine = 1;

		for (const hunk of fileDiff.hunks) {
			if (includeUnchanged) {
				for (; expandedLine < hunk.additionStart; expandedLine += 1) {
					emitLine(
						fileDiff.additionLines[expandedLine - 1] ?? "",
						"additions",
						expandedLine,
					);
				}
			}

			let additionLine = hunk.additionStart;
			let deletionLine = hunk.deletionStart;

			for (const block of hunk.hunkContent) {
				if (block.type === "context") {
					for (let index = 0; index < block.lines; index += 1) {
						emitLine(
							fileDiff.additionLines[block.additionLineIndex + index] ?? "",
							"additions",
							additionLine + index,
						);
					}
					additionLine += block.lines;
					deletionLine += block.lines;
					continue;
				}

				for (let index = 0; index < block.deletions; index += 1) {
					emitLine(
						fileDiff.deletionLines[block.deletionLineIndex + index] ?? "",
						"deletions",
						deletionLine + index,
					);
				}
				for (let index = 0; index < block.additions; index += 1) {
					emitLine(
						fileDiff.additionLines[block.additionLineIndex + index] ?? "",
						"additions",
						additionLine + index,
					);
				}
				deletionLine += block.deletions;
				additionLine += block.additions;
			}

			expandedLine = additionLine;
		}

		if (includeUnchanged) {
			for (; expandedLine <= fileDiff.additionLines.length; expandedLine += 1) {
				emitLine(
					fileDiff.additionLines[expandedLine - 1] ?? "",
					"additions",
					expandedLine,
				);
			}
		}
	}

	return matches;
}
