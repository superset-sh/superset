import { diffIndices } from "node-diff3";

/**
 * Creates a merger that applies edited markdown serializations back onto the
 * original source text so regions the user never touched keep their original
 * bytes — bullet style, hard-wrapped prose, setext headings, escaping, front
 * matter, and raw HTML the parser dropped all survive a save as long as they
 * weren't edited.
 *
 * `parsedBaseline` is the serializer's output for the *unedited* document,
 * captured right after `original` was parsed into the editor. It acts as the
 * merge ancestor: baseline→edited hunks are user edits, baseline→original
 * hunks are parse/serialize formatting noise. The user's edits are applied
 * onto the original through the baseline alignment; where an edit overlaps a
 * region whose original formatting differs from the baseline, the user's edit
 * wins and that region takes the serializer's formatting. Original-side
 * insertions (content the parser dropped entirely, e.g. raw HTML) are kept
 * unless a user edit strictly spans across them.
 *
 * The factory shape exists for performance: the original↔baseline alignment
 * is fixed per load and can be expensive on large documents, while the
 * per-keystroke baseline↔edited diff is tiny. Callers keep one merger per
 * loaded document and call it on every serialization.
 */
export function createMarkdownMerger(
	original: string,
	parsedBaseline: string,
): (edited: string) => string {
	const eol = dominantEol(original);
	const normalizedOriginal =
		eol === "\r\n" ? original.replaceAll("\r\n", "\n") : original;
	const hadTrailingNewline =
		normalizedOriginal === "" || normalizedOriginal.endsWith("\n");

	const aLines = toLines(normalizedOriginal);
	const oLines = toLines(parsedBaseline);
	const aHunks = diffLines(oLines, aLines);

	return (edited: string): string => {
		if (parsedBaseline === edited) {
			return original;
		}

		const lines = applyEditsOntoOriginal(
			aLines,
			aHunks,
			oLines,
			diffLines(oLines, toLines(edited)),
		);

		let merged = lines.join("\n");
		if (merged !== "" && hadTrailingNewline) {
			merged += "\n";
		}
		if (eol === "\r\n") {
			merged = merged.replaceAll("\n", "\r\n");
		}
		return merged;
	};
}

/** One-shot convenience wrapper around {@link createMarkdownMerger}. */
export function mergeMarkdownEdits(
	original: string,
	parsedBaseline: string,
	edited: string,
): string {
	return createMarkdownMerger(original, parsedBaseline)(edited);
}

interface Hunk {
	/** Range in the baseline ("o") buffer this hunk replaces. */
	oStart: number;
	oEnd: number;
	/** Replacement lines from the diffed-against buffer. */
	content: string[];
}

// Segments at or below this size go to node-diff3's exact LCS; larger ones
// are split at unique-line anchors first (patience diff), which keeps the
// worst case near-linear instead of quadratic on documents where the
// serializer normalizes every block.
const EXACT_DIFF_MAX_LINES = 400;

/**
 * Line diff of `o` → `x` as replace hunks over `o` ranges. Outside hunks the
 * sequences are identical line-by-line (the walk in applyEditsOntoOriginal
 * relies on that alignment invariant).
 */
function diffLines(o: string[], x: string[]): Hunk[] {
	const hunks: Hunk[] = [];
	diffSegment(o, x, 0, o.length, 0, x.length, hunks);
	return hunks;
}

function diffSegment(
	o: string[],
	x: string[],
	oLo: number,
	oHi: number,
	xLo: number,
	xHi: number,
	hunks: Hunk[],
): void {
	// Trim common prefix/suffix.
	while (oLo < oHi && xLo < xHi && o[oLo] === x[xLo]) {
		oLo += 1;
		xLo += 1;
	}
	while (oLo < oHi && xLo < xHi && o[oHi - 1] === x[xHi - 1]) {
		oHi -= 1;
		xHi -= 1;
	}
	if (oLo === oHi && xLo === xHi) return;

	if (oHi - oLo <= EXACT_DIFF_MAX_LINES && xHi - xLo <= EXACT_DIFF_MAX_LINES) {
		for (const r of diffIndices(o.slice(oLo, oHi), x.slice(xLo, xHi))) {
			hunks.push({
				oStart: oLo + r.buffer1[0],
				oEnd: oLo + r.buffer1[0] + r.buffer1[1],
				content: r.buffer2Content,
			});
		}
		return;
	}

	const exactAnchors = patienceAnchors(o, x, oLo, oHi, xLo, xHi);
	if (exactAnchors.length > 0) {
		let prevO = oLo;
		let prevX = xLo;
		for (const [ao, ax] of exactAnchors) {
			diffSegment(o, x, prevO, ao, prevX, ax, hunks);
			prevO = ao + 1;
			prevX = ax + 1;
		}
		diffSegment(o, x, prevO, oHi, prevX, xHi, hunks);
		return;
	}

	// No exact-unique common lines (e.g. the serializer normalized every
	// block). Fall back to fuzzy anchors: lines whose alphanumeric signature
	// is unique on both sides ("## Section 3" ↔ "Section 3"). These only
	// guide segmentation — a differing anchor pair is emitted as an explicit
	// one-line replace hunk, so the walk's exact-equality invariant for
	// common segments still holds.
	const fuzzyAnchors = fuzzySignatureAnchors(o, x, oLo, oHi, xLo, xHi);
	if (fuzzyAnchors.length === 0) {
		hunks.push({ oStart: oLo, oEnd: oHi, content: x.slice(xLo, xHi) });
		return;
	}
	let prevO = oLo;
	let prevX = xLo;
	for (const [ao, ax] of fuzzyAnchors) {
		diffSegment(o, x, prevO, ao, prevX, ax, hunks);
		if (o[ao] !== x[ax]) {
			hunks.push({ oStart: ao, oEnd: ao + 1, content: [x[ax] as string] });
		}
		prevO = ao + 1;
		prevX = ax + 1;
	}
	diffSegment(o, x, prevO, oHi, prevX, xHi, hunks);
}

const FUZZY_MIN_SIGNATURE = 3;

function lineSignature(line: string): string {
	return line.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fuzzySignatureAnchors(
	o: string[],
	x: string[],
	oLo: number,
	oHi: number,
	xLo: number,
	xHi: number,
): Array<[number, number]> {
	const oCounts = new Map<string, number>();
	const oIndex = new Map<string, number>();
	for (let i = oLo; i < oHi; i += 1) {
		const sig = lineSignature(o[i] as string);
		if (sig.length < FUZZY_MIN_SIGNATURE) continue;
		oCounts.set(sig, (oCounts.get(sig) ?? 0) + 1);
		oIndex.set(sig, i);
	}
	const xCounts = new Map<string, number>();
	const xIndex = new Map<string, number>();
	for (let i = xLo; i < xHi; i += 1) {
		const sig = lineSignature(x[i] as string);
		if (sig.length < FUZZY_MIN_SIGNATURE) continue;
		xCounts.set(sig, (xCounts.get(sig) ?? 0) + 1);
		xIndex.set(sig, i);
	}
	const pairs: Array<[number, number]> = [];
	for (let i = oLo; i < oHi; i += 1) {
		const sig = lineSignature(o[i] as string);
		if (sig.length < FUZZY_MIN_SIGNATURE) continue;
		if (oCounts.get(sig) === 1 && xCounts.get(sig) === 1) {
			pairs.push([i, xIndex.get(sig) as number]);
		}
	}
	return longestIncreasingByX(pairs);
}

/**
 * Patience-diff anchors: lines occurring exactly once in both segments,
 * matched pairwise, reduced to a longest increasing subsequence so the
 * anchor list is consistent on both sides.
 */
function patienceAnchors(
	o: string[],
	x: string[],
	oLo: number,
	oHi: number,
	xLo: number,
	xHi: number,
): Array<[number, number]> {
	const oCounts = new Map<string, number>();
	const oIndex = new Map<string, number>();
	for (let i = oLo; i < oHi; i += 1) {
		const line = o[i] as string;
		oCounts.set(line, (oCounts.get(line) ?? 0) + 1);
		oIndex.set(line, i);
	}
	const xCounts = new Map<string, number>();
	const xIndex = new Map<string, number>();
	for (let i = xLo; i < xHi; i += 1) {
		const line = x[i] as string;
		xCounts.set(line, (xCounts.get(line) ?? 0) + 1);
		xIndex.set(line, i);
	}

	const pairs: Array<[number, number]> = [];
	for (let i = oLo; i < oHi; i += 1) {
		const line = o[i] as string;
		if (oCounts.get(line) === 1 && xCounts.get(line) === 1) {
			pairs.push([i, xIndex.get(line) as number]);
		}
	}
	// pairs is sorted by o position; take the LIS over x positions.
	return longestIncreasingByX(pairs);
}

function longestIncreasingByX(
	pairs: Array<[number, number]>,
): Array<[number, number]> {
	if (pairs.length === 0) return [];
	const tailIndices: number[] = [];
	const prev = new Array<number>(pairs.length).fill(-1);
	for (let i = 0; i < pairs.length; i += 1) {
		const xPos = (pairs[i] as [number, number])[1];
		let lo = 0;
		let hi = tailIndices.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if ((pairs[tailIndices[mid] as number] as [number, number])[1] < xPos) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}
		if (lo > 0) prev[i] = tailIndices[lo - 1] as number;
		tailIndices[lo] = i;
	}
	const result: Array<[number, number]> = [];
	let at = tailIndices[tailIndices.length - 1] as number;
	while (at !== -1) {
		result.push(pairs[at] as [number, number]);
		at = prev[at] as number;
	}
	result.reverse();
	return result;
}

function isInsertion(hunk: Hunk): boolean {
	return hunk.oEnd === hunk.oStart;
}

// A user hunk conflicts with an original-side hunk when their baseline ranges
// genuinely overlap. Insertions (zero-length ranges) only conflict when they
// sit strictly inside the other side's range — boundary adjacency is fine,
// which is what lets dropped-content insertions survive edits right next to
// them.
function conflicts(a: Hunk, b: Hunk): boolean {
	if (isInsertion(a) && isInsertion(b)) return false;
	if (isInsertion(a)) return b.oStart < a.oStart && a.oStart < b.oEnd;
	if (isInsertion(b)) return a.oStart < b.oStart && b.oStart < a.oEnd;
	return a.oStart < b.oEnd && b.oStart < a.oEnd;
}

// `out.push(...lines)` passes one argument per line and V8 throws a
// RangeError past the argument limit — reachable for documents under the
// editable-size gate, and worse from deep call stacks (the merge runs inside
// ProseMirror dispatch). Manual index loop, same as VS Code's arrays helpers.
function appendRange(
	out: string[],
	lines: string[],
	start = 0,
	end = lines.length,
): void {
	for (let i = start; i < end; i += 1) {
		out.push(lines[i] as string);
	}
}

function applyEditsOntoOriginal(
	aLines: string[],
	aHunks: Hunk[],
	oLines: string[],
	bHunks: Hunk[],
): string[] {
	const out: string[] = [];
	let oPos = 0;
	let aPos = 0;
	let ai = 0;

	// Advances the original-side cursor to baseline position `target`.
	// - "original": emit the original's lines (common segments and hunk
	//   content alike) — the byte-preserving path.
	// - "drop": emit nothing; the caller replaces this range wholesale.
	// Outside conflict unions, hunks never straddle `target`. Insertion hunks
	// sitting exactly at `target` are consumed only when
	// `includeInsertionsAtTarget` is set; otherwise they belong to whatever
	// comes after.
	const advanceTo = (
		target: number,
		mode: "original" | "drop",
		includeInsertionsAtTarget: boolean,
	) => {
		for (;;) {
			const hunk: Hunk | undefined = aHunks[ai];
			const hunkApplies =
				hunk !== undefined &&
				(hunk.oStart < target ||
					(includeInsertionsAtTarget &&
						isInsertion(hunk) &&
						hunk.oStart === target));
			const commonEnd = hunkApplies ? hunk.oStart : target;
			// Common segments are identical in the original and the baseline.
			if (mode !== "drop") {
				appendRange(out, aLines, aPos, aPos + (commonEnd - oPos));
			}
			aPos += commonEnd - oPos;
			oPos = commonEnd;
			if (!hunkApplies) return;
			if (mode === "original") {
				appendRange(out, hunk.content);
			}
			aPos += hunk.content.length;
			oPos = hunk.oEnd;
			ai += 1;
		}
	};

	let bi = 0;
	while (bi < bHunks.length) {
		const first = bHunks[bi] as Hunk;

		// Grow a conflict closure: user hunks and original-side hunks that
		// transitively overlap collapse into one region rendered as the user's
		// serialized form.
		let unionStart = first.oStart;
		let unionEnd = first.oEnd;
		let biEnd = bi + 1;
		let hasConflict = false;
		for (let expanded = true; expanded; ) {
			expanded = false;
			for (let j = ai; j < aHunks.length; j += 1) {
				const aHunk = aHunks[j] as Hunk;
				if (aHunk.oStart > unionEnd) break;
				for (let k = bi; k < biEnd; k += 1) {
					if (conflicts(aHunk, bHunks[k] as Hunk)) {
						hasConflict = true;
						if (aHunk.oStart < unionStart) {
							unionStart = aHunk.oStart;
							expanded = true;
						}
						if (aHunk.oEnd > unionEnd) {
							unionEnd = aHunk.oEnd;
							expanded = true;
						}
						break;
					}
				}
			}
			while (
				biEnd < bHunks.length &&
				(bHunks[biEnd] as Hunk).oStart < unionEnd
			) {
				const swallowed = bHunks[biEnd] as Hunk;
				if (swallowed.oEnd > unionEnd) {
					unionEnd = swallowed.oEnd;
				}
				biEnd += 1;
				expanded = true;
			}
		}

		if (!hasConflict) {
			// Replacements keep boundary insertions (e.g. dropped HTML) in front
			// of them; for pure user insertions the new content goes first so
			// dropped content stays attached to the following original block.
			advanceTo(first.oStart, "original", !isInsertion(first));
			appendRange(out, first.content);
			advanceTo(first.oEnd, "drop", false);
			bi += 1;
			continue;
		}

		advanceTo(unionStart, "original", true);

		// Consume every original-side hunk inside the union up front (they may
		// straddle individual user hunks), keeping insertions so parser-dropped
		// content in the gaps between user hunks is rescued.
		const rescued: Hunk[] = [];
		while (ai < aHunks.length) {
			const hunk = aHunks[ai] as Hunk;
			if (hunk.oStart >= unionEnd) break;
			aPos += Math.max(0, hunk.oStart - oPos) + hunk.content.length;
			oPos = Math.max(oPos, hunk.oEnd);
			if (isInsertion(hunk)) rescued.push(hunk);
			ai += 1;
		}
		aPos += Math.max(0, unionEnd - oPos);
		oPos = unionEnd;

		// Render the union as the user's serialization: their hunks where
		// present, baseline lines in the gaps, rescued insertions interleaved.
		let ri = 0;
		let cursor = unionStart;
		const emitGap = (to: number, includeInsertionsAtEnd: boolean) => {
			while (ri < rescued.length) {
				const ins = rescued[ri] as Hunk;
				const within =
					ins.oStart < to || (includeInsertionsAtEnd && ins.oStart === to);
				if (!within) break;
				if (ins.oStart >= cursor) {
					appendRange(out, oLines, cursor, ins.oStart);
					appendRange(out, ins.content);
					cursor = ins.oStart;
				}
				ri += 1;
			}
			appendRange(out, oLines, cursor, to);
			cursor = to;
		};
		for (let k = bi; k < biEnd; k += 1) {
			const bHunk = bHunks[k] as Hunk;
			emitGap(bHunk.oStart, !isInsertion(bHunk));
			appendRange(out, bHunk.content);
			cursor = bHunk.oEnd;
			// Insertions strictly inside the replaced range are part of the
			// conflict; the user's rewrite wins.
			while (ri < rescued.length && (rescued[ri] as Hunk).oStart < cursor) {
				ri += 1;
			}
		}
		emitGap(unionEnd, false);
		bi = biEnd;
	}

	advanceTo(oLines.length, "original", true);
	return out;
}

function toLines(text: string): string[] {
	const withoutTrailingNewline = text.endsWith("\n") ? text.slice(0, -1) : text;
	return withoutTrailingNewline === ""
		? []
		: withoutTrailingNewline.split("\n");
}

function dominantEol(text: string): "\n" | "\r\n" {
	const crlf = text.split("\r\n").length - 1;
	const lf = text.split("\n").length - 1 - crlf;
	return crlf > lf ? "\r\n" : "\n";
}
