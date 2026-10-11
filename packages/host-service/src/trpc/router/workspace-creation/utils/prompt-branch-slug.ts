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
// @mentions, paths (not a lone `login/logout`), and KEY=value assignments.
const NOT_WORDS = [
	/:\/\//,
	/^www\./i,
	/@/,
	/\\/,
	/^[~.]*\//,
	/\/.*\//,
	/\/.*\.[a-z]+$/i,
	/[a-z0-9]\.[a-z]/i,
	/\d\.\d+\.\d/,
	/=/,
	/^\d+[.)]$/,
];
// The token after one of these is the secret itself, however short.
const SECRET_LABEL =
	/^(?:(?:api[-_]?key|credential|key|passw(?:or)?d|pwd|secret|token)s?:?|pass:)$/i;
const LINKING_WORD = /^(?:is|was|=|:)$/i;
const TRANSLITERATIONS: Record<string, string> = {
	ß: "ss",
	æ: "ae",
	ø: "o",
	œ: "oe",
	đ: "d",
	ł: "l",
	þ: "th",
};

function isWorkItemLabel(token: string, next = ""): boolean {
	return /^(?:issue|pr|mr)$/i.test(token) && /^[#!]\d/.test(next);
}

function followsSecretLabel(tokens: string[], index: number): boolean {
	const previous = tokens[index - 1] ?? "";
	const label = LINKING_WORD.test(previous)
		? (tokens[index - 2] ?? "")
		: previous;
	if (!SECRET_LABEL.test(label)) return false;
	// "token refresh" names a task; "token Abc123" or "token: x" is a value.
	return (
		label.endsWith(":") ||
		previous === "=" ||
		previous === ":" ||
		/[^a-z]/.test(tokens[index] ?? "")
	);
}

/** The first non-empty line outside fenced code (CommonMark fence rules). */
function firstProseLine(prompt: string): string {
	let fence = "";
	for (const line of prompt.split(/\r?\n/)) {
		const [, run = "", rest = ""] =
			/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line) ?? [];
		if (fence) {
			const closes =
				run[0] === fence[0] && run.length >= fence.length && !rest.trim();
			if (closes) fence = "";
			continue;
		}
		if (run) {
			fence = run;
			continue;
		}
		if (line.trim()) return line;
	}
	return "";
}

function looksLikeIdOrSecret(token: string): boolean {
	const bare = token.replace(/[^a-z0-9]/gi, "");
	return (
		(bare.length >= 16 && /\d/.test(bare)) ||
		bare.length >= 32 ||
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
	const words = firstProseLine(prompt)
		.replace(/\]\([^)]*\)/g, "]")
		.replace(/(\p{L})['’](\p{L})/gu, "$1$2")
		.split(/\s+/)
		.filter(
			(token, index, tokens) =>
				!isWorkItemLabel(token, tokens[index + 1]) &&
				!followsSecretLabel(tokens, index) &&
				!NOT_WORDS.some((pattern) => pattern.test(token)) &&
				!looksLikeIdOrSecret(token),
		)
		.join(" ")
		.replace(/[#!]\d+/g, " ")
		.toLowerCase()
		.replace(/[ßæøœđłþ]/g, (letter) => TRANSLITERATIONS[letter] ?? letter)
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
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
