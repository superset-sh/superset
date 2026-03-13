import { sanitizeBranchNameWithMaxLength, sanitizeSegment } from "./branch";

export const DEFAULT_WORKSPACE_TITLE_MAX_LENGTH = 100;
export const DEFAULT_PROMPT_BRANCH_MAX_LENGTH = 30;

/**
 * Common English stop/filler words that add no meaning to a branch name.
 * Only stripped when doing so still leaves meaningful content.
 */
const STOP_WORDS = new Set([
	"i",
	"me",
	"my",
	"we",
	"our",
	"you",
	"your",
	"a",
	"an",
	"the",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"am",
	"do",
	"does",
	"did",
	"have",
	"has",
	"had",
	"will",
	"would",
	"shall",
	"should",
	"can",
	"could",
	"may",
	"might",
	"must",
	"to",
	"of",
	"in",
	"on",
	"at",
	"by",
	"for",
	"from",
	"up",
	"out",
	"off",
	"over",
	"into",
	"with",
	"about",
	"between",
	"through",
	"during",
	"before",
	"after",
	"and",
	"but",
	"or",
	"so",
	"if",
	"then",
	"that",
	"this",
	"these",
	"those",
	"it",
	"its",
	"what",
	"which",
	"who",
	"whom",
	"how",
	"when",
	"where",
	"why",
	"not",
	"no",
	"nor",
	"just",
	"also",
	"very",
	"really",
	"want",
	"need",
	"like",
	"using",
	"please",
	"some",
	"any",
	"all",
	"each",
	"every",
	"both",
	"such",
	"than",
	"too",
	"only",
	"own",
	"same",
	"there",
	"here",
]);

/**
 * Strips common stop/filler words from a prompt to produce a concise slug.
 * Falls back to the original text if stripping removes all words.
 */
export function stripStopWords(text: string): string {
	const words = text
		.trim()
		.split(/\s+/)
		.filter((w) => w.length > 0);
	const filtered = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
	return (filtered.length > 0 ? filtered : words).join(" ");
}

/**
 * Normalized workspace title (for display/storage), derived from a free-form prompt.
 * This does not mutate the actual agent prompt.
 */
export function deriveWorkspaceTitleFromPrompt(
	prompt: string,
	maxLength = DEFAULT_WORKSPACE_TITLE_MAX_LENGTH,
): string {
	return prompt.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * Generates a branch slug from prompt text and applies branch naming constraints.
 * Strips common stop/filler words first so that verbose natural-language prompts
 * produce concise, convention-friendly branch names.
 */
export function deriveWorkspaceBranchFromPrompt(
	prompt: string,
	segmentMaxLength = DEFAULT_PROMPT_BRANCH_MAX_LENGTH,
): string {
	const concise = stripStopWords(prompt);
	const generatedSlug = sanitizeSegment(concise, segmentMaxLength);
	return sanitizeBranchNameWithMaxLength(generatedSlug);
}
