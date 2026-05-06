/**
 * Fuzzy file search scorer — ported from VS Code.
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 * See https://github.com/microsoft/vscode/blob/main/LICENSE.txt
 *
 * Source files:
 * - https://github.com/microsoft/vscode/blob/main/src/vs/base/common/fuzzyScorer.ts
 * - https://github.com/microsoft/vscode/blob/main/src/vs/base/common/filters.ts (matchesPrefix)
 * - https://github.com/microsoft/vscode/blob/main/src/vs/base/common/comparers.ts (compareAnything)
 *
 * VS Code-specific imports (CharCode, filters, comparers, platform, etc.) are
 * inlined below. The scoring algorithm is unchanged.
 */

// ---------------------------------------------------------------------------
// Inlined dependencies from VS Code
// ---------------------------------------------------------------------------

function isUpper(charCode: number): boolean {
	return charCode >= 65 && charCode <= 90; // A-Z
}

enum CharCode {
	Slash = 47,
	Backslash = 92,
	Underline = 95,
	Dash = 45,
	Period = 46,
	Space = 32,
	SingleQuote = 39,
	DoubleQuote = 34,
	Colon = 58,
}

/** Path separator — always `/` for our use case (all paths are normalized to forward slashes). */
const sep = "/";

interface IMatch {
	start: number;
	end: number;
}

/** Case-insensitive prefix check (inlined from VS Code's strings.ts / filters.ts). */
function matchesPrefix(
	word: string,
	wordToMatchAgainst: string,
): IMatch[] | null {
	if (!wordToMatchAgainst || wordToMatchAgainst.length < word.length) {
		return null;
	}

	if (!wordToMatchAgainst.toLowerCase().startsWith(word.toLowerCase())) {
		return null;
	}

	return word.length > 0 ? [{ start: 0, end: word.length }] : [];
}

/** Inlined from VS Code's comparers.ts */
function compareByPrefix(one: string, other: string, lookFor: string): number {
	const elementAName = one.toLowerCase();
	const elementBName = other.toLowerCase();

	const elementAPrefixMatch = elementAName.startsWith(lookFor);
	const elementBPrefixMatch = elementBName.startsWith(lookFor);
	if (elementAPrefixMatch !== elementBPrefixMatch) {
		return elementAPrefixMatch ? -1 : 1;
	}

	if (elementAPrefixMatch && elementBPrefixMatch) {
		if (elementAName.length < elementBName.length) {
			return -1;
		}
		if (elementAName.length > elementBName.length) {
			return 1;
		}
	}

	return 0;
}

function compareAnything(one: string, other: string, lookFor: string): number {
	const elementAName = one.toLowerCase();
	const elementBName = other.toLowerCase();

	const prefixCompare = compareByPrefix(one, other, lookFor);
	if (prefixCompare) {
		return prefixCompare;
	}

	const elementASuffixMatch = elementAName.endsWith(lookFor);
	const elementBSuffixMatch = elementBName.endsWith(lookFor);
	if (elementASuffixMatch !== elementBSuffixMatch) {
		return elementASuffixMatch ? -1 : 1;
	}

	return elementAName.localeCompare(elementBName);
}

// ---------------------------------------------------------------------------
// #region Fuzzy scorer (from VS Code fuzzyScorer.ts)
// ---------------------------------------------------------------------------

export type FuzzyScore = [number /* score */, number[] /* match positions */];
export type FuzzyScorerCache = { [key: string]: IItemScore };

const NO_MATCH = 0;
const NO_SCORE: FuzzyScore = [NO_MATCH, []];

export function scoreFuzzy(
	target: string,
	query: string,
	queryLower: string,
	allowNonContiguousMatches: boolean,
): FuzzyScore {
	if (!target || !query) {
		return NO_SCORE;
	}

	const targetLength = target.length;
	const queryLength = query.length;

	if (targetLength < queryLength) {
		return NO_SCORE;
	}

	const targetLower = target.toLowerCase();
	return doScoreFuzzy(
		query,
		queryLower,
		queryLength,
		target,
		targetLower,
		targetLength,
		allowNonContiguousMatches,
	);
}

function doScoreFuzzy(
	query: string,
	queryLower: string,
	queryLength: number,
	target: string,
	targetLower: string,
	targetLength: number,
	allowNonContiguousMatches: boolean,
): FuzzyScore {
	const scores: number[] = [];
	const matches: number[] = [];

	for (let queryIndex = 0; queryIndex < queryLength; queryIndex++) {
		const queryIndexOffset = queryIndex * targetLength;
		const queryIndexPreviousOffset = queryIndexOffset - targetLength;

		const queryIndexGtNull = queryIndex > 0;

		// biome-ignore lint/style/noNonNullAssertion: ported from VS Code — index in bounds by loop
		const queryCharAtIndex = query[queryIndex]!;
		// biome-ignore lint/style/noNonNullAssertion: ported from VS Code
		const queryLowerCharAtIndex = queryLower[queryIndex]!;

		for (let targetIndex = 0; targetIndex < targetLength; targetIndex++) {
			const targetIndexGtNull = targetIndex > 0;

			const currentIndex = queryIndexOffset + targetIndex;
			const leftIndex = currentIndex - 1;
			const diagIndex = queryIndexPreviousOffset + targetIndex - 1;

			const leftScore = targetIndexGtNull ? (scores[leftIndex] ?? 0) : 0;
			const diagScore =
				queryIndexGtNull && targetIndexGtNull ? (scores[diagIndex] ?? 0) : 0;

			const matchesSequenceLength =
				queryIndexGtNull && targetIndexGtNull ? (matches[diagIndex] ?? 0) : 0;

			let score: number;
			if (!diagScore && queryIndexGtNull) {
				score = 0;
			} else {
				score = computeCharScore(
					queryCharAtIndex,
					queryLowerCharAtIndex,
					target,
					targetLower,
					targetIndex,
					matchesSequenceLength,
				);
			}

			const isValidScore = score && diagScore + score >= leftScore;
			if (
				isValidScore &&
				(allowNonContiguousMatches ||
					queryIndexGtNull ||
					targetLower.startsWith(queryLower, targetIndex))
			) {
				matches[currentIndex] = matchesSequenceLength + 1;
				scores[currentIndex] = diagScore + score;
			} else {
				matches[currentIndex] = NO_MATCH;
				scores[currentIndex] = leftScore;
			}
		}
	}

	const positions: number[] = [];
	let queryIndex = queryLength - 1;
	let targetIndex = targetLength - 1;
	while (queryIndex >= 0 && targetIndex >= 0) {
		const currentIndex = queryIndex * targetLength + targetIndex;
		const match = matches[currentIndex];
		if (match === NO_MATCH) {
			targetIndex--;
		} else {
			positions.push(targetIndex);
			queryIndex--;
			targetIndex--;
		}
	}

	return [scores[queryLength * targetLength - 1] ?? 0, positions.reverse()];
}

function computeCharScore(
	queryCharAtIndex: string,
	queryLowerCharAtIndex: string,
	target: string,
	targetLower: string,
	targetIndex: number,
	matchesSequenceLength: number,
): number {
	let score = 0;

	// biome-ignore lint/style/noNonNullAssertion: ported from VS Code — index in bounds by loop
	if (!considerAsEqual(queryLowerCharAtIndex, targetLower[targetIndex]!)) {
		return score;
	}

	// Character match bonus
	score += 1;

	// Consecutive match bonus
	if (matchesSequenceLength > 0) {
		score +=
			Math.min(matchesSequenceLength, 3) * 6 +
			Math.max(0, matchesSequenceLength - 3) * 3;
	}

	// Same case bonus
	if (queryCharAtIndex === target[targetIndex]) {
		score += 1;
	}

	// Start of word bonus
	if (targetIndex === 0) {
		score += 8;
	} else {
		// After separator bonus
		const separatorBonus = scoreSeparatorAtPos(
			target.charCodeAt(targetIndex - 1),
		);
		if (separatorBonus) {
			score += separatorBonus;
		}
		// Inside word upper case bonus (camelCase), only if not in a contiguous sequence
		else if (
			isUpper(target.charCodeAt(targetIndex)) &&
			matchesSequenceLength === 0
		) {
			score += 2;
		}
	}

	return score;
}

function considerAsEqual(a: string, b: string): boolean {
	if (a === b) {
		return true;
	}

	if (a === "/" || a === "\\") {
		return b === "/" || b === "\\";
	}

	return false;
}

function scoreSeparatorAtPos(charCode: number): number {
	switch (charCode) {
		case CharCode.Slash:
		case CharCode.Backslash:
			return 5;
		case CharCode.Underline:
		case CharCode.Dash:
		case CharCode.Period:
		case CharCode.Space:
		case CharCode.SingleQuote:
		case CharCode.DoubleQuote:
		case CharCode.Colon:
			return 4;
		default:
			return 0;
	}
}

// #endregion

// ---------------------------------------------------------------------------
// #region Item (label, description, path) scorer
// ---------------------------------------------------------------------------

export interface IItemScore {
	score: number;
	labelMatch?: IMatch[];
	descriptionMatch?: IMatch[];
}

const NO_ITEM_SCORE = Object.freeze<IItemScore>({ score: 0 });

export interface IItemAccessor<T> {
	getItemLabel(item: T): string | undefined;
	getItemDescription(item: T): string | undefined;
	getItemPath(file: T): string | undefined;
}

const PATH_IDENTITY_SCORE = 1 << 18;
const LABEL_PREFIX_SCORE_THRESHOLD = 1 << 17;
const LABEL_SCORE_THRESHOLD = 1 << 16;

export function scoreItemFuzzy<T>(
	item: T,
	query: IPreparedQuery,
	allowNonContiguousMatches: boolean,
	accessor: IItemAccessor<T>,
	cache: FuzzyScorerCache,
): IItemScore {
	if (!item || !query.normalized) {
		return NO_ITEM_SCORE;
	}

	const label = accessor.getItemLabel(item);
	if (!label) {
		return NO_ITEM_SCORE;
	}

	const description = accessor.getItemDescription(item);

	const cacheHash = `${label}${description ?? ""}${allowNonContiguousMatches}${query.normalized}`;
	const cached = cache[cacheHash];
	if (cached) {
		return cached;
	}

	const itemScore = doScoreItemFuzzy(
		label,
		description,
		accessor.getItemPath(item),
		query,
		allowNonContiguousMatches,
	);
	cache[cacheHash] = itemScore;

	return itemScore;
}

function doScoreItemFuzzy(
	label: string,
	description: string | undefined,
	path: string | undefined,
	query: IPreparedQuery,
	allowNonContiguousMatches: boolean,
): IItemScore {
	const preferLabelMatches = !path || !query.containsPathSeparator;

	// Treat identity matches on full path highest
	if (path && query.pathNormalized === path) {
		return {
			score: PATH_IDENTITY_SCORE,
			labelMatch: [{ start: 0, end: label.length }],
			descriptionMatch: description
				? [{ start: 0, end: description.length }]
				: undefined,
		};
	}

	// Score: multiple inputs
	if (query.values && query.values.length > 1) {
		return doScoreItemFuzzyMultiple(
			label,
			description,
			path,
			query.values,
			preferLabelMatches,
			allowNonContiguousMatches,
		);
	}

	// Score: single input
	return doScoreItemFuzzySingle(
		label,
		description,
		path,
		query,
		preferLabelMatches,
		allowNonContiguousMatches,
	);
}

function doScoreItemFuzzyMultiple(
	label: string,
	description: string | undefined,
	path: string | undefined,
	query: IPreparedQueryPiece[],
	preferLabelMatches: boolean,
	allowNonContiguousMatches: boolean,
): IItemScore {
	let totalScore = 0;
	const totalLabelMatches: IMatch[] = [];
	const totalDescriptionMatches: IMatch[] = [];

	for (const queryPiece of query) {
		const { score, labelMatch, descriptionMatch } = doScoreItemFuzzySingle(
			label,
			description,
			path,
			queryPiece,
			preferLabelMatches,
			allowNonContiguousMatches,
		);
		if (score === NO_MATCH) {
			return NO_ITEM_SCORE;
		}

		totalScore += score;
		if (labelMatch) {
			totalLabelMatches.push(...labelMatch);
		}
		if (descriptionMatch) {
			totalDescriptionMatches.push(...descriptionMatch);
		}
	}

	return {
		score: totalScore,
		labelMatch: normalizeMatches(totalLabelMatches),
		descriptionMatch: normalizeMatches(totalDescriptionMatches),
	};
}

function doScoreItemFuzzySingle(
	label: string,
	description: string | undefined,
	path: string | undefined,
	query: IPreparedQueryPiece,
	preferLabelMatches: boolean,
	allowNonContiguousMatches: boolean,
): IItemScore {
	// Prefer label matches if told so or we have no description
	if (preferLabelMatches || !description) {
		const [labelScore, labelPositions] = scoreFuzzy(
			label,
			query.normalized,
			query.normalizedLowercase,
			allowNonContiguousMatches && !query.expectContiguousMatch,
		);
		if (labelScore) {
			const labelPrefixMatch = matchesPrefix(query.normalized, label);
			let baseScore: number;
			if (labelPrefixMatch) {
				baseScore = LABEL_PREFIX_SCORE_THRESHOLD;

				// Boost labels that are short (e.g. "window.ts" > "windowActions.ts" for query "window")
				const prefixLengthBoost = Math.round(
					(query.normalized.length / label.length) * 100,
				);
				baseScore += prefixLengthBoost;
			} else {
				baseScore = LABEL_SCORE_THRESHOLD;
			}

			return {
				score: baseScore + labelScore,
				labelMatch: labelPrefixMatch || createMatches(labelPositions),
			};
		}
	}

	// Finally compute description + label scores if we have a description
	if (description) {
		let descriptionPrefix = description;
		if (path) {
			descriptionPrefix = `${description}${sep}`;
		}

		const descriptionPrefixLength = descriptionPrefix.length;
		const descriptionAndLabel = `${descriptionPrefix}${label}`;

		const [labelDescriptionScore, labelDescriptionPositions] = scoreFuzzy(
			descriptionAndLabel,
			query.normalized,
			query.normalizedLowercase,
			allowNonContiguousMatches && !query.expectContiguousMatch,
		);
		if (labelDescriptionScore) {
			const labelDescriptionMatches = createMatches(labelDescriptionPositions);
			const labelMatch: IMatch[] = [];
			const descriptionMatch: IMatch[] = [];

			for (const h of labelDescriptionMatches) {
				if (
					h.start < descriptionPrefixLength &&
					h.end > descriptionPrefixLength
				) {
					labelMatch.push({ start: 0, end: h.end - descriptionPrefixLength });
					descriptionMatch.push({
						start: h.start,
						end: descriptionPrefixLength,
					});
				} else if (h.start >= descriptionPrefixLength) {
					labelMatch.push({
						start: h.start - descriptionPrefixLength,
						end: h.end - descriptionPrefixLength,
					});
				} else {
					descriptionMatch.push(h);
				}
			}

			return { score: labelDescriptionScore, labelMatch, descriptionMatch };
		}
	}

	return NO_ITEM_SCORE;
}

function createMatches(offsets: number[] | undefined): IMatch[] {
	const ret: IMatch[] = [];
	if (!offsets) {
		return ret;
	}

	let last: IMatch | undefined;
	for (const pos of offsets) {
		if (last && last.end === pos) {
			last.end += 1;
		} else {
			last = { start: pos, end: pos + 1 };
			ret.push(last);
		}
	}

	return ret;
}

function normalizeMatches(matches: IMatch[]): IMatch[] {
	const sortedMatches = matches.sort(
		(matchA, matchB) => matchA.start - matchB.start,
	);

	const normalizedMatches: IMatch[] = [];
	let currentMatch: IMatch | undefined;
	for (const match of sortedMatches) {
		if (!currentMatch || !matchOverlaps(currentMatch, match)) {
			currentMatch = match;
			normalizedMatches.push(match);
		} else {
			currentMatch.start = Math.min(currentMatch.start, match.start);
			currentMatch.end = Math.max(currentMatch.end, match.end);
		}
	}

	return normalizedMatches;
}

function matchOverlaps(matchA: IMatch, matchB: IMatch): boolean {
	if (matchA.end < matchB.start) {
		return false;
	}
	if (matchB.end < matchA.start) {
		return false;
	}
	return true;
}

// #endregion

// ---------------------------------------------------------------------------
// #region Comparers
// ---------------------------------------------------------------------------

export function compareItemsByFuzzyScore<T>(
	itemA: T,
	itemB: T,
	query: IPreparedQuery,
	allowNonContiguousMatches: boolean,
	accessor: IItemAccessor<T>,
	cache: FuzzyScorerCache,
): number {
	const itemScoreA = scoreItemFuzzy(
		itemA,
		query,
		allowNonContiguousMatches,
		accessor,
		cache,
	);
	const itemScoreB = scoreItemFuzzy(
		itemB,
		query,
		allowNonContiguousMatches,
		accessor,
		cache,
	);

	const scoreA = itemScoreA.score;
	const scoreB = itemScoreB.score;

	// 1.) identity matches have highest score
	if (scoreA === PATH_IDENTITY_SCORE || scoreB === PATH_IDENTITY_SCORE) {
		if (scoreA !== scoreB) {
			return scoreA === PATH_IDENTITY_SCORE ? -1 : 1;
		}
	}

	// 2.) matches on label are considered higher compared to label+description matches
	if (scoreA > LABEL_SCORE_THRESHOLD || scoreB > LABEL_SCORE_THRESHOLD) {
		if (scoreA !== scoreB) {
			return scoreA > scoreB ? -1 : 1;
		}

		// prefer more compact matches over longer in label
		if (
			scoreA < LABEL_PREFIX_SCORE_THRESHOLD &&
			scoreB < LABEL_PREFIX_SCORE_THRESHOLD
		) {
			const comparedByMatchLength = compareByMatchLength(
				itemScoreA.labelMatch,
				itemScoreB.labelMatch,
			);
			if (comparedByMatchLength !== 0) {
				return comparedByMatchLength;
			}
		}

		// prefer shorter labels over longer labels
		const labelA = accessor.getItemLabel(itemA) || "";
		const labelB = accessor.getItemLabel(itemB) || "";
		if (labelA.length !== labelB.length) {
			return labelA.length - labelB.length;
		}
	}

	// 3.) compare by score in label+description
	if (scoreA !== scoreB) {
		return scoreA > scoreB ? -1 : 1;
	}

	// 4.) scores are identical: prefer matches in label over non-label matches
	const itemAHasLabelMatches =
		Array.isArray(itemScoreA.labelMatch) && itemScoreA.labelMatch.length > 0;
	const itemBHasLabelMatches =
		Array.isArray(itemScoreB.labelMatch) && itemScoreB.labelMatch.length > 0;
	if (itemAHasLabelMatches && !itemBHasLabelMatches) {
		return -1;
	} else if (itemBHasLabelMatches && !itemAHasLabelMatches) {
		return 1;
	}

	// 5.) scores are identical: prefer more compact matches (label and description)
	const itemAMatchDistance = computeLabelAndDescriptionMatchDistance(
		itemA,
		itemScoreA,
		accessor,
	);
	const itemBMatchDistance = computeLabelAndDescriptionMatchDistance(
		itemB,
		itemScoreB,
		accessor,
	);
	if (
		itemAMatchDistance &&
		itemBMatchDistance &&
		itemAMatchDistance !== itemBMatchDistance
	) {
		return itemBMatchDistance > itemAMatchDistance ? -1 : 1;
	}

	// 6.) scores are identical: start to use the fallback compare
	return fallbackCompare(itemA, itemB, query, accessor);
}

function computeLabelAndDescriptionMatchDistance<T>(
	item: T,
	score: IItemScore,
	accessor: IItemAccessor<T>,
): number {
	let matchStart = -1;
	let matchEnd = -1;

	if (score.descriptionMatch?.length) {
		// biome-ignore lint/style/noNonNullAssertion: ported from VS Code — length already checked
		matchStart = score.descriptionMatch[0]!.start;
	} else if (score.labelMatch?.length) {
		// biome-ignore lint/style/noNonNullAssertion: ported from VS Code — length already checked
		matchStart = score.labelMatch[0]!.start;
	}

	if (score.labelMatch?.length) {
		// biome-ignore lint/style/noNonNullAssertion: ported from VS Code — length already checked
		matchEnd = score.labelMatch[score.labelMatch.length - 1]!.end;
		if (score.descriptionMatch?.length) {
			const itemDescription = accessor.getItemDescription(item);
			if (itemDescription) {
				matchEnd += itemDescription.length;
			}
		}
	} else if (score.descriptionMatch?.length) {
		// biome-ignore lint/style/noNonNullAssertion: ported from VS Code — length already checked
		matchEnd = score.descriptionMatch[score.descriptionMatch.length - 1]!.end;
	}

	return matchEnd - matchStart;
}

function compareByMatchLength(
	matchesA?: IMatch[],
	matchesB?: IMatch[],
): number {
	if ((!matchesA && !matchesB) || (!matchesA?.length && !matchesB?.length)) {
		return 0;
	}

	if (!matchesB?.length) {
		return -1;
	}

	if (!matchesA?.length) {
		return 1;
	}

	// biome-ignore lint/style/noNonNullAssertion: ported from VS Code — length already checked above
	const matchStartA = matchesA[0]!.start;
	// biome-ignore lint/style/noNonNullAssertion: ported from VS Code
	const matchEndA = matchesA[matchesA.length - 1]!.end;
	const matchLengthA = matchEndA - matchStartA;

	// biome-ignore lint/style/noNonNullAssertion: ported from VS Code — length already checked above
	const matchStartB = matchesB[0]!.start;
	// biome-ignore lint/style/noNonNullAssertion: ported from VS Code
	const matchEndB = matchesB[matchesB.length - 1]!.end;
	const matchLengthB = matchEndB - matchStartB;

	return matchLengthA === matchLengthB
		? 0
		: matchLengthB < matchLengthA
			? 1
			: -1;
}

function fallbackCompare<T>(
	itemA: T,
	itemB: T,
	query: IPreparedQuery,
	accessor: IItemAccessor<T>,
): number {
	const labelA = accessor.getItemLabel(itemA) || "";
	const labelB = accessor.getItemLabel(itemB) || "";

	const descriptionA = accessor.getItemDescription(itemA);
	const descriptionB = accessor.getItemDescription(itemB);

	const labelDescriptionALength =
		labelA.length + (descriptionA ? descriptionA.length : 0);
	const labelDescriptionBLength =
		labelB.length + (descriptionB ? descriptionB.length : 0);

	if (labelDescriptionALength !== labelDescriptionBLength) {
		return labelDescriptionALength - labelDescriptionBLength;
	}

	const pathA = accessor.getItemPath(itemA);
	const pathB = accessor.getItemPath(itemB);

	if (pathA && pathB && pathA.length !== pathB.length) {
		return pathA.length - pathB.length;
	}

	if (labelA !== labelB) {
		return compareAnything(labelA, labelB, query.normalized);
	}

	if (descriptionA && descriptionB && descriptionA !== descriptionB) {
		return compareAnything(descriptionA, descriptionB, query.normalized);
	}

	if (pathA && pathB && pathA !== pathB) {
		return compareAnything(pathA, pathB, query.normalized);
	}

	return 0;
}

// #endregion

// ---------------------------------------------------------------------------
// #region Query normalizer
// ---------------------------------------------------------------------------

export interface IPreparedQueryPiece {
	original: string;
	originalLowercase: string;
	pathNormalized: string;
	normalized: string;
	normalizedLowercase: string;
	expectContiguousMatch: boolean;
}

export interface IPreparedQuery extends IPreparedQueryPiece {
	values: IPreparedQueryPiece[] | undefined;
	containsPathSeparator: boolean;
}

function queryExpectsExactMatch(query: string) {
	return query.startsWith('"') && query.endsWith('"');
}

const MULTIPLE_QUERY_VALUES_SEPARATOR = " ";

export function prepareQuery(original: string): IPreparedQuery {
	if (typeof original !== "string") {
		original = "";
	}

	const originalLowercase = original.toLowerCase();
	const { pathNormalized, normalized, normalizedLowercase } =
		normalizeQuery(original);
	const containsPathSeparator = pathNormalized.indexOf(sep) >= 0;
	const expectExactMatch = queryExpectsExactMatch(original);

	let values: IPreparedQueryPiece[] | undefined;

	const originalSplit = original.split(MULTIPLE_QUERY_VALUES_SEPARATOR);
	if (originalSplit.length > 1) {
		for (const originalPiece of originalSplit) {
			const expectExactMatchPiece = queryExpectsExactMatch(originalPiece);
			const {
				pathNormalized: pathNormalizedPiece,
				normalized: normalizedPiece,
				normalizedLowercase: normalizedLowercasePiece,
			} = normalizeQuery(originalPiece);

			if (normalizedPiece) {
				if (!values) {
					values = [];
				}

				values.push({
					original: originalPiece,
					originalLowercase: originalPiece.toLowerCase(),
					pathNormalized: pathNormalizedPiece,
					normalized: normalizedPiece,
					normalizedLowercase: normalizedLowercasePiece,
					expectContiguousMatch: expectExactMatchPiece,
				});
			}
		}
	}

	return {
		original,
		originalLowercase,
		pathNormalized,
		normalized,
		normalizedLowercase,
		values,
		containsPathSeparator,
		expectContiguousMatch: expectExactMatch,
	};
}

function normalizeQuery(original: string): {
	pathNormalized: string;
	normalized: string;
	normalizedLowercase: string;
} {
	// Normalize backslashes to forward slashes (we always use forward slashes)
	const pathNormalized = original.replace(/\\/g, sep);

	// Remove quotes, wildcards, whitespace, ellipsis, trailing hash
	const normalized = pathNormalized
		.replace(/[*\u2026\s"]/g, "")
		.replace(/(?<=.)#$/, "");

	return {
		pathNormalized,
		normalized,
		normalizedLowercase: normalized.toLowerCase(),
	};
}

// #endregion
