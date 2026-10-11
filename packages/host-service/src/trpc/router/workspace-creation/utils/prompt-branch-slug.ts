const MAX_WORDS = 4;
const MAX_LENGTH = 30;

const FILLER_WORDS = new Set([
	"things",
	"thing",
	"stuff",
	"something",
	"really",
	"okay",
	"ok",
	"need",
	"make",
	"get",
	"does",
	"basically",
	"anything",
	"actually",
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

// Pasted things that would leak into a path, matched on whole
// whitespace-separated tokens: links, domains and file names, emails and
// @mentions, paths, and KEY=value assignments.
const NOT_WORDS = [
	/:\/\//,
	/^www\./i,
	/@/,
	/[\\/~]/,
	/[a-z0-9]\.[a-z]/i,
	/\d\.\d+\.\d/,
	/=/,
];
// The token after one of these is the secret itself, however short.
const SECRET_LABEL = /^(api-?key|passw(or)?d|pwd|secret|token)s?:?$/i;

function looksLikeIdOrSecret(token: string): boolean {
	const bare = token.replace(/[^a-z0-9]/gi, "");
	return (
		bare.length >= 16 ||
		(/^[0-9a-f]{7,}$/i.test(bare) && /\d/.test(bare)) ||
		/^\d{6,}$/.test(bare)
	);
}

/**
 * A few words of the prompt for the folder and first branch name, so the
 * worktree reads well from creation without a later move. Null when nothing
 * is left to name it by: a greeting, only links, or a non-Latin script.
 */
export function promptBranchSlug(prompt: string): string | null {
	const firstLine =
		prompt
			.replace(/```[\s\S]*?(?:```|$)/g, " ")
			.split(/\r?\n/)
			.find((line) => line.trim()) ?? "";
	const words = firstLine
		.replace(/\]\([^)]*\)/g, "]")
		.split(/\s+/)
		.filter(
			(token, index, tokens) =>
				!SECRET_LABEL.test(tokens[index - 1] ?? "") &&
				!NOT_WORDS.some((pattern) => pattern.test(token)) &&
				!looksLikeIdOrSecret(token),
		)
		.join(" ")
		.replace(/#\d+/g, " ")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
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
