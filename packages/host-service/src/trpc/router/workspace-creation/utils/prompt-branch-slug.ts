const MAX_WORDS = 4;
const MAX_LENGTH = 30;

const FILLER_WORDS = new Set([
	"a",
	"about",
	"an",
	"and",
	"are",
	"at",
	"be",
	"can",
	"could",
	"do",
	"for",
	"hello",
	"help",
	"hey",
	"hi",
	"i",
	"im",
	"in",
	"into",
	"is",
	"it",
	"just",
	"let",
	"lets",
	"look",
	"me",
	"my",
	"of",
	"on",
	"or",
	"our",
	"please",
	"pls",
	"s",
	"so",
	"sup",
	"thanks",
	"that",
	"the",
	"there",
	"this",
	"to",
	"u",
	"us",
	"want",
	"we",
	"will",
	"with",
	"would",
	"yo",
	"you",
	"your",
]);

/**
 * A few words of the prompt for the folder and first branch name, so the
 * worktree reads well from creation without a later move. Null when nothing
 * is left to name it by: a greeting, only links, or a non-Latin script.
 */
export function promptBranchSlug(prompt: string): string | null {
	const words = prompt
		.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ")
		.replace(/#\d+/g, " ")
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word && !FILLER_WORDS.has(word));
	const picked: string[] = [];
	for (const word of words) {
		if (picked.length === MAX_WORDS) break;
		if ([...picked, word].join("-").length > MAX_LENGTH) break;
		picked.push(word);
	}
	return picked.length > 0 ? picked.join("-") : null;
}
