export interface ReviewReportFinding {
	file: string;
	line?: number;
	category?: string;
	summary: string;
	shortSummary?: string;
	failureScenario: string;
	verdict?: "CONFIRMED" | "PLAUSIBLE";
}

export interface ReviewReportCheck {
	name: string;
	status: "success" | "failure" | "pending" | "skipped" | "cancelled";
	url?: string | null;
}

export interface ReviewReportComment {
	authorLogin: string;
	authorAvatarUrl?: string | null;
	/** Markdown, rendered the same way as the description. */
	body: string;
	createdAt: string | Date;
	htmlUrl?: string;
}

export interface ReviewReportInput {
	title: string;
	repo?: string;
	prNumber?: number;
	prUrl?: string;
	branch?: string;
	commitSha?: string;
	effortLevel?: string;
	generatedAt: string | Date;
	findings?: ReviewReportFinding[];
	/** Raw unified diff text, e.g. the output of `gh pr diff <n>`. */
	diff?: string;
	/**
	 * A PR's own markdown description. When set (even to ""), and there are no
	 * findings, the Summary tab renders as a plain PR view — a description (or
	 * a "No description provided." placeholder) instead of the findings empty
	 * state, whose "no findings" copy would misleadingly imply a review ran.
	 * Undefined means this is a review report, not a PR view.
	 */
	description?: string;
	/** The PR's conversation comments, oldest first. Only shown alongside `description`. */
	comments?: ReviewReportComment[];
	/**
	 * CI checks for the head commit. Only rendered in the plain-PR view, as a
	 * right-hand aside like the real Summary tab; [] still shows the section
	 * with its "No checks reported" empty row, undefined hides it entirely.
	 */
	checks?: ReviewReportCheck[];
	/** Normalized PR state for the header badge, matching the real header's precedence (draft wins over merged/closed). */
	prState?: "open" | "closed" | "merged" | "draft";
	authorLogin?: string;
	authorAvatarUrl?: string | null;
	/**
	 * When set, the meta row shows a relative age ("2h ago") like the real PR
	 * header instead of the generated date — truthful here (unlike the static
	 * share pages) because the /pr viewer renders this HTML at view time.
	 */
	createdAt?: string | Date;
}

interface DiffSegment {
	text: string;
	changed: boolean;
}

interface DiffLine {
	type: "add" | "remove" | "context" | "hunk";
	content: string;
	oldLine?: number;
	newLine?: number;
	/** No trailing newline in the source file after this line. */
	noNewline?: boolean;
	/** Word-level diff, set only when this line paired 1:1 with its counterpart. */
	segments?: DiffSegment[];
}

interface DiffFile {
	path: string;
	additions: number;
	deletions: number;
	binary: boolean;
	lines: DiffLine[];
}

/**
 * Parses `git diff --git` unified-diff text — the same format `gh pr diff`
 * emits and the app's own getDiff procedure passes to its diff viewer — into
 * per-file line lists. Deliberately minimal: enough for typical PR diffs,
 * not a full patch-application parser.
 */
function parseUnifiedDiff(diffText: string): DiffFile[] {
	const files: DiffFile[] = [];
	let current: DiffFile | null = null;
	// Header lines (---/+++/rename from&to/index/etc.) only ever appear before
	// a file's first hunk marker; once a hunk starts, every line is content.
	// Needed because a removed/added line whose own text starts with "-- " or
	// "++ " (a SQL/Lua/Haskell comment, say) becomes "--- ..."/"+++ ..." once
	// the diff's leading +/- marker is prepended, which would otherwise
	// collide with the header-line checks below.
	let inHeader = true;
	// Running old/new line counters, reset at each hunk header and advanced
	// per content line, so every rendered line can show its real line number.
	let oldLine = 0;
	let newLine = 0;

	const finishFile = () => {
		if (current?.path) {
			pairWordDiffs(current.lines);
			files.push(current);
		}
	};

	// Trim exactly one trailing newline (typical of real `gh pr diff` output)
	// so it doesn't split into a spurious trailing empty context line.
	for (const line of diffText.replace(/\n$/, "").split("\n")) {
		if (line.startsWith("diff --git ")) {
			finishFile();
			current = {
				path: "",
				additions: 0,
				deletions: 0,
				binary: false,
				lines: [],
			};
			inHeader = true;
			// Best-effort initial guess, ambiguous when a path itself contains
			// " b/" — the non-greedy first group at least resolves the common
			// case correctly. More authoritative lines below (---/+++/rename
			// to) override this whenever present; it's the only source for a
			// binary file's path, which has none of those.
			const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
			if (match) current.path = match[2] ?? match[1] ?? "";
			continue;
		}
		if (!current) continue;

		if (line.startsWith("@@")) {
			inHeader = false;
			const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
			if (hunk?.[1] && hunk[2]) {
				oldLine = Number(hunk[1]);
				newLine = Number(hunk[2]);
			}
			current.lines.push({ type: "hunk", content: line });
			continue;
		}

		if (inHeader) {
			// Always bare paths, prefix or not — the definitive source for a
			// pure rename (no content change), which has no --- /+++ lines.
			if (line.startsWith("rename to ")) {
				current.path = line.slice("rename to ".length).trim();
				continue;
			}
			if (line.startsWith("rename from ")) {
				if (!current.path) {
					current.path = line.slice("rename from ".length).trim();
				}
				continue;
			}
			if (line.startsWith("--- ")) {
				const path = line.slice(4).trim();
				if (!current.path && path !== "/dev/null") {
					current.path = path.replace(/^a\//, "");
				}
				continue;
			}
			if (line.startsWith("+++ ")) {
				const path = line.slice(4).trim();
				if (path !== "/dev/null") current.path = path.replace(/^b\//, "");
				continue;
			}
			if (line.startsWith("Binary files ")) {
				current.binary = true;
				continue;
			}
			// Other header noise (index/mode/similarity lines) — nothing to do.
			continue;
		}

		if (line.startsWith("+")) {
			current.additions += 1;
			current.lines.push({ type: "add", content: line.slice(1), newLine });
			newLine += 1;
			continue;
		}
		if (line.startsWith("-")) {
			current.deletions += 1;
			current.lines.push({ type: "remove", content: line.slice(1), oldLine });
			oldLine += 1;
			continue;
		}
		if (line.startsWith("\\")) {
			// "\ No newline at end of file" describes whichever content line
			// immediately precedes it.
			const last = current.lines.at(-1);
			if (last) last.noNewline = true;
			continue;
		}
		if (line.startsWith(" ") || line === "") {
			current.lines.push({
				type: "context",
				content: line.slice(1),
				oldLine,
				newLine,
			});
			oldLine += 1;
			newLine += 1;
		}
	}
	finishFile();
	return files;
}

/** Splits a line's text into word/punctuation/whitespace runs, losslessly. */
function tokenize(text: string): string[] {
	return text.match(/\w+|[^\w\s]|\s+/g) ?? [];
}

/**
 * Attaches word-level diff segments to 1:1-paired remove/add line runs — the
 * common "this line was edited" case. Left alone (segments stays unset,
 * falling back to whole-line coloring) when a run's remove/add counts don't
 * match, since pairing lines index-by-index across mismatched runs produces
 * misleading highlights.
 */
function pairWordDiffs(lines: DiffLine[]): void {
	let i = 0;
	while (i < lines.length) {
		if (lines[i]?.type !== "remove") {
			i += 1;
			continue;
		}
		let removeEnd = i;
		while (lines[removeEnd]?.type === "remove") removeEnd += 1;
		let addEnd = removeEnd;
		while (lines[addEnd]?.type === "add") addEnd += 1;

		const removeCount = removeEnd - i;
		const addCount = addEnd - removeEnd;
		if (removeCount !== addCount) {
			i = addEnd;
			continue;
		}
		for (let offset = 0; offset < removeCount; offset++) {
			const removeLine = lines[i + offset];
			const addLine = lines[removeEnd + offset];
			if (!removeLine || !addLine) continue;
			const [removeSegments, addSegments] = diffWords(
				removeLine.content,
				addLine.content,
			);
			removeLine.segments = removeSegments;
			addLine.segments = addSegments;
		}
		i = addEnd;
	}
}

/** Longest-common-prefix/suffix word diff between two lines. Simple, not a full LCS — good enough for the common single-edit-per-line case. */
function diffWords(
	oldText: string,
	newText: string,
): [DiffSegment[], DiffSegment[]] {
	const oldTokens = tokenize(oldText);
	const newTokens = tokenize(newText);
	const maxCommon = Math.min(oldTokens.length, newTokens.length);

	let prefix = 0;
	while (prefix < maxCommon && oldTokens[prefix] === newTokens[prefix]) {
		prefix += 1;
	}
	let suffix = 0;
	while (
		suffix < maxCommon - prefix &&
		oldTokens[oldTokens.length - 1 - suffix] ===
			newTokens[newTokens.length - 1 - suffix]
	) {
		suffix += 1;
	}

	const toSegments = (tokens: string[]): DiffSegment[] => {
		const segments: DiffSegment[] = [];
		if (prefix > 0) {
			segments.push({ text: tokens.slice(0, prefix).join(""), changed: false });
		}
		const middle = tokens.slice(prefix, tokens.length - suffix);
		if (middle.length > 0) {
			segments.push({ text: middle.join(""), changed: true });
		}
		if (suffix > 0) {
			segments.push({
				text: tokens.slice(tokens.length - suffix).join(""),
				changed: false,
			});
		}
		return segments;
	};

	return [toSegments(oldTokens), toSegments(newTokens)];
}

type Tone = "confirmed" | "plausible" | "unverified" | "clear";

// A CONFIRMED finding is bad news, an unverified one is informational only —
// reuse the same red/amber/gray severity language the PR review screens use
// for reviewDecision and check status, not a green-means-good scale.
const VERDICT_GROUPS: ReadonlyArray<{
	key: ReviewReportFinding["verdict"];
	label: string;
	tone: Tone;
}> = [
	{ key: "CONFIRMED", label: "Confirmed", tone: "confirmed" },
	{ key: "PLAUSIBLE", label: "Plausible", tone: "plausible" },
	{ key: undefined, label: "Unverified", tone: "unverified" },
];

// Lucide outline icons (24x24, stroke-based) — the same icon language (and
// path data) as the react-icons Lu* set the app's PR screens use.
const ICON_PATHS = {
	x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	alert:
		'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
	minus: '<path d="M5 12h14"/>',
	check: '<path d="M20 6 9 17l-5-5"/>',
	arrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
	chevronRight: '<path d="m9 18 6-6-6-6"/>',
	gitBranch:
		'<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
	// The three PR-state marks the real header's PRIcon renders (Lucide
	// git-pull-request-arrow / git-merge / circle-dot).
	gitPullRequest:
		'<circle cx="5" cy="6" r="3"/><path d="M5 9v12"/><circle cx="19" cy="18" r="3"/><path d="m15 9-3-3 3-3"/><path d="M12 6h5a2 2 0 0 1 2 2v7"/>',
	gitMerge:
		'<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
	circleDot: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
	// The check-status marks CHECK_STATUS_ICONS uses (Lucide loader-circle /
	// skip-forward, plus circle-minus for the checks empty row).
	loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
	skipForward:
		'<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
	circleMinus: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
} as const;

// FaGithub from react-icons — the same mark the real PR header's
// open-in-GitHub button renders (filled, not stroked, hence not in
// ICON_PATHS).
const GITHUB_ICON_SVG =
	'<svg class="icon gh" viewBox="0 0 496 512" fill="currentColor" aria-hidden="true"><path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/></svg>';

const TONE_ICON: Record<Tone, keyof typeof ICON_PATHS> = {
	confirmed: "x",
	plausible: "alert",
	unverified: "minus",
	clear: "check",
};

function icon(name: keyof typeof ICON_PATHS, className: string): string {
	return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
}

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function githubBlobUrl(
	repo: string,
	commitSha: string,
	file: string,
	line?: number,
): string {
	const path = file
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	const fragment = line ? `#L${line}` : "";
	return `https://github.com/${repo}/blob/${commitSha}/${path}${fragment}`;
}

function renderLocation(
	finding: ReviewReportFinding,
	repo?: string,
	commitSha?: string,
): string {
	const label = escapeHtml(
		finding.line ? `${finding.file}:${finding.line}` : finding.file,
	);
	const labelHtml = `<span class="location-label mono">${label}</span>`;
	if (!repo || !commitSha) {
		return `<span class="location">${labelHtml}</span>`;
	}
	const url = githubBlobUrl(repo, commitSha, finding.file, finding.line);
	return `<a class="location" href="${escapeHtml(url)}">${labelHtml}${icon("arrowUpRight", "arrow")}</a>`;
}

function renderFinding(
	finding: ReviewReportFinding,
	tone: Tone,
	repo?: string,
	commitSha?: string,
): string {
	const category = finding.category
		? `<span class="category">${escapeHtml(finding.category)}</span>`
		: "";
	return `
<div class="finding">
	<div class="finding-head">
		${icon(TONE_ICON[tone], `tone-${tone}`)}
		${category}
		${renderLocation(finding, repo, commitSha)}
	</div>
	<p class="summary">${escapeHtml(finding.summary)}</p>
	<details class="failure">
		<summary>${icon("chevronRight", "chev")}Failure scenario</summary>
		<p>${escapeHtml(finding.failureScenario)}</p>
	</details>
</div>`;
}

function renderLineNumber(n: number | undefined): string {
	return `<span class="diff-ln">${n ?? ""}</span>`;
}

function renderLineContent(line: DiffLine): string {
	if (!line.segments) return escapeHtml(line.content);
	const changedClass =
		line.type === "add" ? "diff-word-add" : "diff-word-remove";
	return line.segments
		.map((segment) =>
			segment.changed
				? `<mark class="${changedClass}">${escapeHtml(segment.text)}</mark>`
				: escapeHtml(segment.text),
		)
		.join("");
}

function renderDiffLine(line: DiffLine): string {
	if (line.type === "hunk") {
		return `<div class="diff-hunk mono">${escapeHtml(line.content)}</div>`;
	}
	const marker = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
	const noNewline = line.noNewline
		? `<span class="diff-no-newline">No newline at end of file</span>`
		: "";
	return `
<div class="diff-line diff-${line.type}">
	${renderLineNumber(line.oldLine)}
	${renderLineNumber(line.newLine)}
	<span class="diff-marker">${marker}</span>
	<pre class="mono">${renderLineContent(line)}${noNewline}</pre>
</div>`;
}

/** Dims the directory portion of a path, matching the real PR view's header. */
function renderFilePath(path: string): string {
	const slash = path.lastIndexOf("/");
	if (slash === -1)
		return `<span class="diff-file-base">${escapeHtml(path)}</span>`;
	const dir = escapeHtml(path.slice(0, slash + 1));
	const base = escapeHtml(path.slice(slash + 1));
	return `<span class="diff-file-dir">${dir}</span><span class="diff-file-base">${base}</span>`;
}

function renderDiffFile(file: DiffFile, id: string): string {
	const stats = [
		file.additions > 0
			? `<span class="diff-stat-add">+${file.additions}</span>`
			: "",
		file.deletions > 0
			? `<span class="diff-stat-del">-${file.deletions}</span>`
			: "",
	].join("");

	const body = file.binary
		? `<div class="diff-binary">Binary file not shown</div>`
		: file.lines.map(renderDiffLine).join("\n");

	return `
<details class="diff-file" id="${id}" open>
	<summary>
		${icon("chevronRight", "chev")}
		<span class="diff-file-path mono">${renderFilePath(file.path)}</span>
		<span class="diff-stats">${stats}</span>
	</summary>
	<div class="diff-body">${body}</div>
</details>`;
}

function renderFilesNav(files: DiffFile[]): string {
	if (files.length < 2) return "";
	const rows = files
		.map((file, index) => {
			const stats = [
				file.additions > 0
					? `<span class="diff-stat-add">+${file.additions}</span>`
					: "",
				file.deletions > 0
					? `<span class="diff-stat-del">-${file.deletions}</span>`
					: "",
			].join("");
			return `<li><a href="#diff-file-${index}" class="mono">${renderFilePath(file.path)}</a><span class="diff-stats">${stats}</span></li>`;
		})
		.join("\n");
	return `
<nav class="diff-files-nav">
	<h3>Files changed <span class="diff-files-nav-count">${files.length}</span></h3>
	<ul>${rows}</ul>
</nav>`;
}

function renderCodeTab(diffText: string): string {
	const files = parseUnifiedDiff(diffText);
	if (files.length === 0) {
		return `<div class="section-body"><div class="empty-row">No file changes to show.</div></div>`;
	}
	const nav = renderFilesNav(files);
	const body = files
		.map((file, index) => renderDiffFile(file, `diff-file-${index}`))
		.join("\n");
	return `${nav}${body}`;
}

function renderSummaryPill(counts: Record<Tone, number>): string {
	const confirmed = counts.confirmed;
	const plausible = counts.plausible;
	const unverified = counts.unverified;

	const { tone, label } =
		confirmed > 0
			? { tone: "confirmed" as const, label: `${confirmed} confirmed` }
			: plausible > 0
				? { tone: "plausible" as const, label: `${plausible} plausible` }
				: unverified > 0
					? {
							tone: "unverified" as const,
							label: `${unverified} finding${unverified === 1 ? "" : "s"}`,
						}
					: { tone: "clear" as const, label: "No issues found" };

	return `<span class="pill pill-${tone}">${icon(TONE_ICON[tone], "")}${label}</span>`;
}

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

// The real meta row shows a relative age ("3h ago"), which a static page
// can't keep truthful — an absolute date is the honest equivalent.
function formatGeneratedAt(value: string | Date): string | null {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

// Mirrors the desktop's formatRelativeTime scale exactly ("now", Ns, Nm, Nh,
// Nd, Nmo) with the header's own " ago" suffix rule.
function formatRelativeAge(value: string | Date): string | null {
	const timestamp = new Date(value).getTime();
	if (Number.isNaN(timestamp)) return null;
	const diffMs = Math.max(0, Date.now() - timestamp);
	const seconds = Math.floor(diffMs / 1000);
	const minutes = Math.floor(diffMs / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const months = Math.floor(days / 30);
	if (seconds < 5) return "now";
	if (minutes < 1) return `${seconds}s ago`;
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 30) return `${days}d ago`;
	return `${months}mo ago`;
}

const PR_STATE_ICONS: Record<
	NonNullable<ReviewReportInput["prState"]>,
	keyof typeof ICON_PATHS
> = {
	open: "gitPullRequest",
	draft: "gitPullRequest",
	merged: "gitMerge",
	closed: "circleDot",
};

function renderStateBadge(
	state: NonNullable<ReviewReportInput["prState"]>,
): string {
	return `<span class="state-badge state-${state}">${icon(PR_STATE_ICONS[state], "")}${state}</span>`;
}

function renderAuthor(review: ReviewReportInput): string {
	const login = escapeHtml(review.authorLogin ?? "");
	const avatar = review.authorAvatarUrl
		? `<img class="author-avatar" src="${escapeHtml(review.authorAvatarUrl)}" alt="">`
		: `<span class="author-avatar author-avatar-fallback">${login.slice(0, 1).toUpperCase()}</span>`;
	return `<span class="author">${avatar}${login}</span>`;
}

function renderMetaItems(review: ReviewReportInput): string[] {
	const items: string[] = [];
	// The state badge and author sit side by side with no separator dot
	// between them, exactly like the real header; dots resume from the PR
	// number on.
	const leading: string[] = [];
	if (review.prState) leading.push(renderStateBadge(review.prState));
	if (review.authorLogin) leading.push(renderAuthor(review));
	if (leading.length > 0) items.push(leading.join("\n\t\t"));
	if (review.prNumber) {
		items.push(`<span class="meta-num mono">#${review.prNumber}</span>`);
	}
	if (review.repo) {
		items.push(`<span class="meta-plain">${escapeHtml(review.repo)}</span>`);
	}
	if (review.branch) {
		items.push(
			`<span class="branch mono">${icon("gitBranch", "")}<span class="branch-label">${escapeHtml(review.branch)}</span></span>`,
		);
	}
	if (review.commitSha) {
		items.push(
			`<span class="meta-mono mono">${escapeHtml(review.commitSha.slice(0, 7))}</span>`,
		);
	}
	if (review.effortLevel) {
		items.push(
			`<span class="meta-plain">${escapeHtml(review.effortLevel)} review</span>`,
		);
	}
	const age = review.createdAt ? formatRelativeAge(review.createdAt) : null;
	if (age) {
		items.push(`<span class="meta-plain">${age}</span>`);
	} else {
		const generated = formatGeneratedAt(review.generatedAt);
		if (generated) {
			items.push(`<span class="meta-plain">generated ${generated}</span>`);
		}
	}
	return items;
}

const META_SEPARATOR = "\n\t\t<span aria-hidden>·</span>\n\t\t";

// A plain-string placeholder (not a regex) sidesteps both the control-char
// lint a regex literal would trip and any risk of the token appearing
// unescaped in real prose.
const CODE_PLACEHOLDER = "CODE";

/**
 * Raw HTML a PR description is allowed to embed and have actually rendered,
 * instead of showing up as visible `&lt;sup&gt;` garbage. GitHub descriptions
 * routinely contain hand-written or bot-generated HTML (badges, `<details>`
 * spoilers, `<sup>`/`<br>`) alongside plain markdown — real CommonMark (and
 * GitHub's renderer) render both. Anything not on this list is left for
 * `escapeHtml` to neutralize as plain text, same as today.
 */
const ALLOWED_HTML_TAGS = [
	"a",
	"b",
	"i",
	"em",
	"strong",
	"code",
	"pre",
	"br",
	"hr",
	"sup",
	"sub",
	"small",
	"mark",
	"kbd",
	"p",
	"div",
	"span",
	"details",
	"summary",
	"table",
	"thead",
	"tbody",
	"tr",
	"td",
	"th",
	"ul",
	"ol",
	"li",
	"blockquote",
	"img",
	"picture",
	"source",
	"figure",
	"figcaption",
] as const;
const VOID_HTML_TAGS = new Set(["br", "hr", "img", "source"]);
/** Attributes kept per tag; everything else (style, on*, id, class, …) is dropped. */
const ALLOWED_HTML_ATTRS: Partial<
	Record<(typeof ALLOWED_HTML_TAGS)[number], string[]>
> = {
	img: ["src", "alt", "title", "width", "height"],
	source: ["srcset", "src", "media", "type"],
	details: ["open"],
	td: ["align", "colspan", "rowspan"],
	th: ["align", "colspan", "rowspan"],
};
const SAFE_URL_SCHEME = /^(https?:|mailto:)/i;

// Matches only a complete `<tag ...>`, `<tag ... />`, or `</tag>` for a
// tag name in ALLOWED_HTML_TAGS — anything else (a stray `<`, a "5 < 10"
// comparison, a disallowed tag like `<script>`) simply doesn't match and
// falls through to normal text escaping.
const INLINE_HTML_TAG_PATTERN = new RegExp(
	`<\\/?(?:${ALLOWED_HTML_TAGS.join("|")})(?:\\s[^<>]*)?\\/?>`,
	"gi",
);

/** Rebuilds one matched tag with only its allowlisted, scheme-checked attributes. */
function sanitizeTag(tag: string): string {
	const isClosing = tag.startsWith("</");
	const name = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(tag)?.[1]?.toLowerCase();
	if (!name) return "";
	if (isClosing) return VOID_HTML_TAGS.has(name) ? "" : `</${name}>`;

	const allowedAttrs =
		ALLOWED_HTML_ATTRS[name as (typeof ALLOWED_HTML_TAGS)[number]] ?? [];
	const attrs: string[] = [];
	for (const match of tag.matchAll(/([a-zA-Z-:]+)\s*=\s*"([^"]*)"/g)) {
		const attrName = match[1]?.toLowerCase();
		const attrValue = match[2] ?? "";
		if (!attrName || !allowedAttrs.includes(attrName)) continue;
		if (
			(attrName === "src" || attrName === "href") &&
			!SAFE_URL_SCHEME.test(attrValue)
		) {
			continue;
		}
		attrs.push(`${attrName}="${escapeHtml(attrValue)}"`);
	}
	// A raw <a href> gets the same forced target/rel as markdown links below —
	// the source's own target/rel (if any) is never trusted or kept.
	if (name === "a" && /\shref\s*=/.test(tag)) {
		const hrefMatch = /href\s*=\s*"([^"]*)"/.exec(tag);
		const href = hrefMatch?.[1];
		if (href && SAFE_URL_SCHEME.test(href)) {
			attrs.unshift(`href="${escapeHtml(href)}"`);
			attrs.push('target="_blank"', 'rel="noopener noreferrer"');
		} else {
			return ""; // an <a> with no safe href isn't worth keeping as a tag
		}
	}
	const attrsHtml = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
	return `<${name}${attrsHtml}>`;
}

/**
 * Escapes plain text but passes allowlisted HTML tags through (sanitized) as
 * real markup — used for both inline text and raw HTML blocks below.
 */
function sanitizeInlineHtml(text: string): string {
	let result = "";
	let lastIndex = 0;
	for (const match of text.matchAll(INLINE_HTML_TAG_PATTERN)) {
		result += escapeHtml(text.slice(lastIndex, match.index));
		result += sanitizeTag(match[0]);
		lastIndex = match.index + match[0].length;
	}
	result += escapeHtml(text.slice(lastIndex));
	return result;
}

/** Inline markdown within a single line/paragraph: code, bold, italic, links, safe raw HTML. */
function renderInline(text: string): string {
	const codeSpans: string[] = [];
	// Pull inline code out first so its literal contents never get treated as
	// bold/italic/link syntax, then patch the escaped spans back in by a
	// placeholder token unlikely to collide with real prose.
	const withPlaceholders = text.replace(/`([^`]+)`/g, (_match, code) => {
		codeSpans.push(`<code>${escapeHtml(code)}</code>`);
		return CODE_PLACEHOLDER;
	});

	let html = sanitizeInlineHtml(withPlaceholders);
	// Links first — its own escaped brackets/parens would otherwise collide
	// with the bold/italic patterns below. A PR description is authored by
	// whoever opened the PR, not us — reject any scheme but http(s)/mailto so
	// a `javascript:`/`data:` link can't run script on click; anything else
	// degrades to plain (already-escaped) text rather than a live link.
	html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
		const isSafe = /^(https?:|mailto:)/i.test(url) || /^[^a-z]/i.test(url);
		if (!isSafe) return match;
		return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
	});
	html = html.replace(
		/\*\*([^*]+)\*\*|__([^_]+)__/g,
		(_match, a, b) => `<strong>${a ?? b}</strong>`,
	);
	html = html.replace(
		/\*([^*]+)\*|_([^_]+)_/g,
		(_match, a, b) => `<em>${a ?? b}</em>`,
	);

	let spanIndex = 0;
	return html.replaceAll(CODE_PLACEHOLDER, () => codeSpans[spanIndex++] ?? "");
}

/** `- [x] done` / `- [ ] todo` — GitHub's task-list checkbox syntax. */
function renderListItem(item: string): string {
	const task = /^\[([ xX])\]\s+(.*)$/.exec(item);
	if (!task) return `<li>${renderInline(item)}</li>`;
	const checked = task[1] !== " ";
	return `<li class="task-list-item"><input type="checkbox" disabled${checked ? " checked" : ""}> ${renderInline(task[2] ?? "")}</li>`;
}

/**
 * Minimal markdown-to-HTML for a PR's own description — headers, fenced code
 * blocks, blockquotes, lists, task checkboxes, and paragraphs with inline
 * formatting (including a safe subset of raw HTML — see ALLOWED_HTML_TAGS).
 * Not a full CommonMark implementation (no nested lists, no tables); this
 * package stays dependency-free by design, same reasoning as
 * parseUnifiedDiff above.
 */
function renderMarkdown(rawMarkdown: string): string {
	// HTML comments (bot-generated descriptions lean on these to hide
	// metadata markers) render as nothing, same as every real markdown
	// renderer — not as visible "&lt;!-- ... --&gt;" text.
	const markdown = rawMarkdown.replace(/<!--[\s\S]*?-->/g, "");
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const blocks: string[] = [];
	let paragraph: string[] = [];
	let list: { tag: "ul" | "ol"; items: string[] } | null = null;
	let quote: string[] | null = null;

	const flushParagraph = () => {
		if (paragraph.length === 0) return;
		blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
		paragraph = [];
	};
	const flushList = () => {
		if (!list) return;
		blocks.push(
			`<${list.tag}>${list.items.map(renderListItem).join("")}</${list.tag}>`,
		);
		list = null;
	};
	const flushQuote = () => {
		if (!quote) return;
		blocks.push(`<blockquote>${renderInline(quote.join(" "))}</blockquote>`);
		quote = null;
	};
	const flushAll = () => {
		flushParagraph();
		flushList();
		flushQuote();
	};

	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? "";

		const fence = /^```(\w*)\s*$/.exec(line);
		if (fence) {
			flushAll();
			const codeLines: string[] = [];
			i += 1;
			while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) {
				codeLines.push(lines[i] ?? "");
				i += 1;
			}
			blocks.push(
				`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
			);
			i += 1; // skip closing fence
			continue;
		}

		// A line opening or closing one of our allowed HTML tags starts a raw
		// HTML block — real bot-generated PR descriptions embed multi-line
		// blocks like `<a href=…><picture><source …><img …></picture></a>` or
		// `<details><summary>…</summary>…</details>` for badges/collapsibles.
		// Consumed verbatim through the next blank line (CommonMark's own
		// blank-line-terminated HTML block rule), then sanitized as one unit
		// rather than run through paragraph/list parsing.
		if (/^<\/?[a-zA-Z]/.test(line.trim())) {
			flushAll();
			const htmlLines: string[] = [line];
			i += 1;
			while (i < lines.length && !/^\s*$/.test(lines[i] ?? "")) {
				htmlLines.push(lines[i] ?? "");
				i += 1;
			}
			blocks.push(sanitizeInlineHtml(htmlLines.join("\n")));
			continue;
		}

		const heading = /^(#{1,4})\s+(.*)$/.exec(line);
		if (heading?.[1] && heading[2] !== undefined) {
			flushAll();
			const level = heading[1].length;
			blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
			i += 1;
			continue;
		}

		if (/^\s*>\s?/.test(line)) {
			flushParagraph();
			flushList();
			quote ??= [];
			quote.push(line.replace(/^\s*>\s?/, ""));
			i += 1;
			continue;
		}
		flushQuote();

		const unordered = /^\s*[-*]\s+(.*)$/.exec(line);
		const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
		if (unordered || ordered) {
			flushParagraph();
			const tag = ordered ? "ol" : "ul";
			const item = (unordered?.[1] ?? ordered?.[1] ?? "").trim();
			if (!list || list.tag !== tag) {
				flushList();
				list = { tag, items: [] };
			}
			list.items.push(item);
			i += 1;
			continue;
		}
		flushList();

		if (/^\s*$/.test(line)) {
			flushParagraph();
			i += 1;
			continue;
		}
		if (/^(---|\*\*\*|___)\s*$/.test(line)) {
			flushParagraph();
			blocks.push("<hr>");
			i += 1;
			continue;
		}

		paragraph.push(line.trim());
		i += 1;
	}
	flushAll();

	return blocks.join("\n");
}

// Same word-per-outcome vocabulary as the real Checks section's rows.
const CHECK_STATUS_META: Record<
	ReviewReportCheck["status"],
	{ icon: keyof typeof ICON_PATHS; label: string }
> = {
	success: { icon: "check", label: "Passed" },
	failure: { icon: "x", label: "Failed" },
	pending: { icon: "loader", label: "Running" },
	skipped: { icon: "skipForward", label: "Skipped" },
	cancelled: { icon: "minus", label: "Cancelled" },
};

/** Mirrors summarizePullRequestChecks: skipped/cancelled don't count. */
function checksSummaryLabel(checks: ReviewReportCheck[]): string {
	const relevant = checks.filter(
		(check) => check.status !== "skipped" && check.status !== "cancelled",
	);
	const failing = relevant.filter((c) => c.status === "failure").length;
	const pending = relevant.filter((c) => c.status === "pending").length;
	if (relevant.length === 0) {
		return checks.length === 0
			? "No checks reported"
			: "All checks skipped or cancelled";
	}
	if (failing > 0) return `${failing} failing`;
	if (pending > 0) return `${pending} running`;
	return `All ${relevant.length} passed`;
}

function renderCheckRow(check: ReviewReportCheck): string {
	const meta = CHECK_STATUS_META[check.status];
	const inner = `${icon(meta.icon, `check-icon-${check.status}`)}<span class="check-name">${escapeHtml(check.name)}</span><span class="check-label">${meta.label}</span>${check.url ? icon("arrowUpRight", "arrow") : ""}`;
	if (check.url) {
		return `<a class="check-row" href="${escapeHtml(check.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
	}
	return `<div class="check-row">${inner}</div>`;
}

function renderChecksSection(checks: ReviewReportCheck[]): string {
	const rows =
		checks.length === 0
			? `<div class="check-empty">${icon("circleMinus", "")}No checks reported for the latest commit.</div>`
			: checks.map(renderCheckRow).join("\n");
	return `
<section class="checks">
	<div class="checks-head">
		<h2>Checks</h2>
		<span class="checks-summary">${checksSummaryLabel(checks)}</span>
	</div>
	${rows}
</section>`;
}

function renderComment(comment: ReviewReportComment): string {
	const author = escapeHtml(comment.authorLogin);
	const avatar = comment.authorAvatarUrl
		? `<img class="comment-avatar" src="${escapeHtml(comment.authorAvatarUrl)}" alt="">`
		: `<span class="comment-avatar comment-avatar-fallback"></span>`;
	const date = formatGeneratedAt(comment.createdAt);
	const authorHtml = comment.htmlUrl
		? `<a class="comment-author" href="${escapeHtml(comment.htmlUrl)}" target="_blank" rel="noopener noreferrer">${author}</a>`
		: `<span class="comment-author">${author}</span>`;
	return `
<div class="comment">
	<div class="comment-head">
		${avatar}
		${authorHtml}
		${date ? `<span class="comment-date">commented ${date}</span>` : ""}
	</div>
	<div class="comment-body markdown">${renderMarkdown(comment.body)}</div>
</div>`;
}

function renderComments(comments: ReviewReportComment[]): string {
	if (comments.length === 0) return "";
	return `
<div class="comments">
	<h2 class="comments-heading">Comments <span class="comments-count">${comments.length}</span></h2>
	${comments.map(renderComment).join("\n")}
</div>`;
}

export function renderReviewReportHtml(review: ReviewReportInput): string {
	const findings = review.findings ?? [];
	const groups = VERDICT_GROUPS.map((group) => ({
		...group,
		findings: findings.filter((f) => f.verdict === group.key),
	})).filter((group) => group.findings.length > 0);

	const counts: Record<Tone, number> = {
		confirmed: findings.filter((f) => f.verdict === "CONFIRMED").length,
		plausible: findings.filter((f) => f.verdict === "PLAUSIBLE").length,
		unverified: findings.filter((f) => !f.verdict).length,
		clear: 0,
	};

	// A plain PR view (no AI review ever ran) has no findings to show — a
	// description renders instead of the "no findings" empty state, and the
	// findings pill is dropped rather than implying a review ran clean.
	const isPlainPrView =
		findings.length === 0 && review.description !== undefined;

	const descriptionHtml = review.description?.trim()
		? `<div class="markdown">${renderMarkdown(review.description)}</div>`
		: `<p class="no-description">No description provided.</p>`;
	// Same shape as the real Summary tab's grid: description (and, unlike the
	// app, the conversation) in the main column, checks in a sticky aside that
	// moves below on narrow screens.
	const plainPrBody = `<div class="summary-grid">
	<div class="summary-main">${descriptionHtml}${renderComments(review.comments ?? [])}</div>
	${review.checks ? `<aside class="summary-aside">${renderChecksSection(review.checks)}</aside>` : ""}
</div>`;
	const body = isPlainPrView
		? plainPrBody
		: groups.length === 0
			? `<div class="section-body"><div class="empty-row">${icon("check", "")}No findings — this review didn't flag anything.</div></div>`
			: groups
					.map(
						(group) => `
<section>
	<div class="section-head">
		<h2>${group.label}</h2>
		<span class="section-summary">${group.findings.length} finding${group.findings.length === 1 ? "" : "s"}</span>
	</div>
	<div class="section-body">
		${group.findings.map((f) => renderFinding(f, group.tone, review.repo, review.commitSha)).join("\n")}
	</div>
</section>`,
					)
					.join("\n");

	const titleHtml = escapeHtml(review.title);
	const metaItems = isPlainPrView
		? renderMetaItems(review)
		: [renderSummaryPill(counts), ...renderMetaItems(review)];
	const githubButtonHtml = review.prUrl
		? `<a class="gh-btn" href="${escapeHtml(review.prUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open pull request in GitHub" title="Open pull request in GitHub">${GITHUB_ICON_SVG}</a>`
		: "";
	const tabBarHtml = review.diff
		? `<label for="tab-summary" class="tab-label">Summary</label>
		<label for="tab-code" class="tab-label">Code</label>`
		: `<span class="tab-label tab-label-active">Summary</span>`;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titleHtml}</title>
<style>
/* Tokens mirror the app's globals.css (light :root.light values, dark :root
   defaults). A public page has no app theme switcher, so dark rides the
   prefers-color-scheme media query instead of the .dark class. */
:root {
	--background: #f9f9fa;
	--foreground: oklch(0.145 0 0);
	--muted: oklch(0.97 0 0);
	--muted-foreground: #4a4847;
	--accent: oklch(0.97 0 0);
	--border: oklch(0.922 0 0);
	--ring: oklch(0.708 0 0);
	/* Pill colors mirror the PR state badge formula (Tailwind v4 rose/amber
	   oklch tokens + the explicit open-badge hex); icon colors mirror the
	   check-status icon palette (red-600/emerald-600) — the app itself uses
	   two different reds for these two contexts. */
	--tone-confirmed-bg: oklch(94.1% 0.03 12.58);
	--tone-confirmed-fg: oklch(58.6% 0.253 17.585);
	--icon-confirmed-fg: oklch(57.7% 0.245 27.325);
	--tone-plausible-bg: oklch(96.2% 0.059 95.617);
	--tone-plausible-fg: oklch(66.6% 0.179 58.318);
	--tone-clear-bg: #dcfae8;
	--tone-clear-fg: #00a558;
	--icon-clear-fg: oklch(59.6% 0.145 163.225);
	/* Merged-PR badge (Tailwind violet-100/violet-600, dark values hand-tuned
	   in the app's STATE_BADGE_STYLES); open reuses tone-clear, closed reuses
	   tone-confirmed — same pairs the real badge uses. */
	--state-merged-bg: oklch(94.3% 0.029 294.588);
	--state-merged-fg: oklch(54.1% 0.281 293.009);
	/* Diff line colors match the app's own file-diff-tool.tsx (Tailwind v4
	   green/red oklch tokens): border/bg stay fixed, only the text color
	   shifts between light and dark. */
	--diff-add-border: oklch(72.3% 0.219 149.579);
	--diff-add-bg: color-mix(in oklab, oklch(72.3% 0.219 149.579) 10%, transparent);
	--diff-add-fg: oklch(52.7% 0.154 150.069);
	--diff-remove-border: oklch(63.7% 0.237 25.331);
	--diff-remove-bg: color-mix(in oklab, oklch(63.7% 0.237 25.331) 10%, transparent);
	--diff-remove-fg: oklch(50.5% 0.213 27.518);
	/* Word-level diff highlight: same hues as the line-level tint above, at
	   higher opacity so an edited span stands out against its own line. */
	--diff-word-add-bg: color-mix(in oklab, oklch(72.3% 0.219 149.579) 35%, transparent);
	--diff-word-remove-bg: color-mix(in oklab, oklch(63.7% 0.237 25.331) 35%, transparent);
	/* Diff-stat counts use green-500/red-500 in both themes, exactly like
	   file-diff-tool's +N/-N status node. */
	--diff-stat-add: oklch(72.3% 0.219 149.579);
	--diff-stat-del: oklch(63.7% 0.237 25.331);
}
@media (prefers-color-scheme: dark) {
	:root {
		--background: #151110;
		--foreground: #eae8e6;
		--muted: #2a2827;
		--muted-foreground: #a8a5a3;
		--accent: #2a2827;
		--border: #2a2827;
		--ring: #3a3837;
		--tone-confirmed-bg: #4a2020;
		--tone-confirmed-fg: #e0918a;
		--icon-confirmed-fg: #f87171;
		--tone-plausible-bg: #78350f;
		--tone-plausible-fg: #fbbf24;
		--tone-clear-bg: #064e3b;
		--tone-clear-fg: #34d399;
		--icon-clear-fg: #34d399;
		--state-merged-bg: #322b47;
		--state-merged-fg: #b0a6d9;
		--diff-add-fg: oklch(79.2% 0.209 151.711);
		--diff-remove-fg: oklch(70.4% 0.191 22.216);
	}
	.gh-btn:hover { background: color-mix(in oklab, var(--accent) 50%, transparent); }
}
* { box-sizing: border-box; border-color: var(--border); }
html, body { margin: 0; padding: 0; }
body {
	background: var(--background);
	color: var(--foreground);
	font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
	font-size: 1rem;
	line-height: 1.5;
	-webkit-font-smoothing: antialiased;
}
/* Scrollbars match the app's global scrollbar styling. */
* { scrollbar-width: thin; scrollbar-color: rgb(63 63 70 / 0.5) transparent; }
*::-webkit-scrollbar { width: 12px; height: 12px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb {
	background-color: rgb(63 63 70 / 0.5);
	border-radius: 6px;
	border: 3px solid transparent;
	background-clip: padding-box;
}
*::-webkit-scrollbar-thumb:hover { background-color: rgb(82 82 91 / 0.7); }
*::-webkit-scrollbar-corner { background: transparent; }
.icon { width: 14px; height: 14px; display: inline-block; vertical-align: -2px; flex-shrink: 0; }
a { color: inherit; text-decoration: none; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
/* Header block: flex shrink-0 flex-col border-b border-border, same as the
   real PR detail page's header. */
header { display: flex; flex-direction: column; border-bottom: 1px solid var(--border); }
.tab-row { display: flex; height: 2.5rem; align-items: center; gap: 0.25rem; padding: 0 1rem; }
.tab-label {
	cursor: pointer;
	user-select: none;
	border-radius: 8px;
	padding: 0.25rem 0.5rem;
	font-size: 0.75rem;
	line-height: 1rem;
	font-weight: 500;
	color: var(--muted-foreground);
	transition: color 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.tab-label:hover { color: var(--foreground); }
.tab-label-active { background: var(--accent); color: var(--foreground); cursor: default; }
#tab-summary:checked ~ header label[for="tab-summary"],
#tab-code:checked ~ header label[for="tab-code"] {
	background: var(--accent);
	color: var(--foreground);
}
.title-row {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 0 1rem 0.75rem;
}
h1 {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 1.25rem;
	line-height: 1.25;
	font-weight: 600;
	margin: 0;
}
/* Ghost icon-sm button (size-8, rounded-md, hover:bg-accent) wrapping the
   FaGithub mark, like the real header's open-in-GitHub button. */
.gh-btn {
	display: inline-flex;
	flex-shrink: 0;
	width: 2rem;
	height: 2rem;
	align-items: center;
	justify-content: center;
	border-radius: 8px;
	color: var(--foreground);
	transition: color 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.gh-btn:hover { background: var(--accent); }
.gh-btn:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent);
}
.gh-btn .icon { width: 16px; height: 16px; }
.meta-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem;
	padding: 0 1rem 0.75rem;
	font-size: 0.75rem;
	line-height: 1rem;
	color: var(--muted-foreground);
}
.pill {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	gap: 0.25rem;
	border-radius: 9999px;
	padding: 0.25rem 0.5rem;
	font-weight: 500;
	text-transform: capitalize;
}
.pill .icon { width: 12px; height: 12px; }
.pill-confirmed { background: var(--tone-confirmed-bg); color: var(--tone-confirmed-fg); }
.pill-plausible { background: var(--tone-plausible-bg); color: var(--tone-plausible-fg); }
.pill-unverified { background: var(--muted); color: var(--muted-foreground); }
.pill-clear { background: var(--tone-clear-bg); color: var(--tone-clear-fg); }
/* PR state pill: rounded-full px-2 py-1 font-medium capitalize + a size-3
   icon, exactly like the real header's badge. */
.state-badge {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	gap: 0.25rem;
	border-radius: 9999px;
	padding: 0.25rem 0.5rem;
	font-weight: 500;
	text-transform: capitalize;
}
.state-badge .icon { width: 12px; height: 12px; }
.state-open { background: var(--tone-clear-bg); color: var(--tone-clear-fg); }
.state-closed { background: var(--tone-confirmed-bg); color: var(--tone-confirmed-fg); }
.state-merged { background: var(--state-merged-bg); color: var(--state-merged-fg); }
.state-draft { background: var(--muted); color: var(--muted-foreground); }
.author { display: flex; flex-shrink: 0; align-items: center; gap: 0.375rem; }
.author-avatar { width: 20px; height: 20px; border-radius: 9999px; flex-shrink: 0; }
.author-avatar-fallback {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: color-mix(in oklab, var(--muted) 60%, transparent);
	font-size: 9px;
}
.meta-num { flex-shrink: 0; font-variant-numeric: tabular-nums; }
.meta-mono, .meta-plain { flex-shrink: 0; }
.branch { display: flex; min-width: 0; flex-shrink: 1; align-items: center; gap: 0.25rem; }
.branch .icon { width: 12px; height: 12px; }
.branch-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Content region: px-4 py-6, @md:px-6, @4xl:py-8 like the real Summary tab. */
.content { padding: 1.5rem 1rem; }
@media (min-width: 28rem) { .content { padding-left: 1.5rem; padding-right: 1.5rem; } }
@media (min-width: 56rem) { .content { padding-top: 2rem; padding-bottom: 2rem; } }
section + section { margin-top: 2rem; }
.section-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	margin-bottom: 0.75rem;
}
h2 { font-size: 0.875rem; line-height: 1.25rem; font-weight: 600; margin: 0; }
.section-summary { font-size: 0.75rem; line-height: 1rem; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.section-body {
	border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
	border-radius: 10px;
	background: color-mix(in oklab, var(--muted) 15%, transparent);
	overflow: hidden;
}
.finding {
	padding: 0.625rem 0.75rem;
	border-bottom: 1px solid color-mix(in oklab, var(--border) 50%, transparent);
}
.finding:last-child { border-bottom: none; }
.finding:hover { background: color-mix(in oklab, var(--accent) 40%, transparent); }
.finding-head { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
.tone-confirmed { color: var(--icon-confirmed-fg); }
.tone-plausible { color: var(--tone-plausible-fg); }
.tone-unverified { color: var(--muted-foreground); }
.category {
	flex-shrink: 0;
	border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
	background: color-mix(in oklab, var(--muted) 35%, transparent);
	border-radius: 4px;
	padding: 0 0.25rem;
	font-size: 0.5625rem;
	text-transform: uppercase;
	letter-spacing: 0.025em;
	color: var(--muted-foreground);
}
.location {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
	flex: 1 1 auto;
	font-size: 0.75rem;
	line-height: 1rem;
	color: var(--muted-foreground);
}
.location-label {
	min-width: 0;
	flex: 1 1 auto;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
a.location:hover { color: var(--foreground); text-decoration: none; }
.location .arrow { color: var(--muted-foreground); flex-shrink: 0; }
.summary { font-size: 0.875rem; line-height: 1.25rem; font-weight: 500; margin: 0.5rem 0 0; }
details.failure { margin-top: 0.375rem; }
details.failure summary {
	cursor: pointer;
	list-style: none;
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.75rem;
	line-height: 1rem;
	font-weight: 500;
}
details.failure summary::-webkit-details-marker { display: none; }
details.failure summary .chev {
	width: 12px;
	height: 12px;
	color: var(--muted-foreground);
	transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
details.failure[open] summary .chev { transform: rotate(90deg); }
details.failure p { margin: 0.375rem 0 0; font-size: 0.875rem; line-height: 1.25rem; color: var(--muted-foreground); }
.empty-row {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.75rem;
	color: var(--muted-foreground);
	font-size: 0.75rem;
	line-height: 1rem;
}
.empty-row .icon { color: var(--icon-clear-fg); }
.tab-radio { position: absolute; opacity: 0; pointer-events: none; }
.tab-panel { display: none; }
#tab-summary:checked ~ #panel-summary { display: block; }
#tab-code:checked ~ #panel-code { display: block; }
.diff-file {
	border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
	border-radius: 10px;
	background: color-mix(in oklab, var(--muted) 15%, transparent);
	overflow: hidden;
}
.diff-file + .diff-file { margin-top: 0.75rem; }
.diff-file summary {
	cursor: pointer;
	list-style: none;
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.625rem 0.75rem;
	font-size: 0.75rem;
	line-height: 1rem;
}
.diff-file summary:hover { background: color-mix(in oklab, var(--accent) 40%, transparent); }
.diff-file summary::-webkit-details-marker { display: none; }
.diff-file summary .chev {
	width: 12px;
	height: 12px;
	color: var(--muted-foreground);
	transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.diff-file[open] summary .chev { transform: rotate(90deg); }
.diff-file-path { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diff-file-dir { color: var(--muted-foreground); }
.diff-stats { flex-shrink: 0; display: flex; gap: 0.375rem; }
.diff-stat-add { color: var(--diff-stat-add); }
.diff-stat-del { color: var(--diff-stat-del); }
.diff-body {
	max-height: 480px;
	overflow-y: auto;
	border-top: 1px solid color-mix(in oklab, var(--border) 50%, transparent);
	font-size: 0.75rem;
	line-height: 1rem;
}
.diff-hunk { padding: 0.25rem 0.625rem; color: var(--muted-foreground); background: color-mix(in oklab, var(--muted) 60%, transparent); }
.diff-line { display: flex; align-items: flex-start; padding: 0.125rem 0.625rem; border-left: 2px solid transparent; }
.diff-line pre { margin: 0; flex: 1 1 auto; min-width: 0; white-space: pre-wrap; word-break: break-all; }
.diff-ln {
	flex-shrink: 0;
	width: 2rem;
	margin-right: 0.5rem;
	text-align: right;
	color: var(--muted-foreground);
	user-select: none;
	font-variant-numeric: tabular-nums;
}
.diff-marker { margin-right: 0.5rem; user-select: none; }
.diff-add { border-left-color: var(--diff-add-border); background: var(--diff-add-bg); color: var(--diff-add-fg); }
.diff-remove { border-left-color: var(--diff-remove-border); background: var(--diff-remove-bg); color: var(--diff-remove-fg); }
.diff-context { color: var(--muted-foreground); }
.diff-word-add, .diff-word-remove { border-radius: 3px; color: inherit; }
.diff-word-add { background: var(--diff-word-add-bg); }
.diff-word-remove { background: var(--diff-word-remove-bg); }
.diff-no-newline { margin-left: 0.5rem; color: var(--muted-foreground); font-style: italic; }
.diff-binary { padding: 0.625rem 0.75rem; color: var(--muted-foreground); font-style: italic; }
.diff-files-nav {
	border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
	border-radius: 10px;
	background: color-mix(in oklab, var(--muted) 15%, transparent);
	overflow: hidden;
	margin-bottom: 0.75rem;
}
.diff-files-nav h3 {
	margin: 0;
	padding: 0.625rem 0.75rem;
	font-size: 0.75rem;
	font-weight: 600;
	border-bottom: 1px solid color-mix(in oklab, var(--border) 50%, transparent);
}
.diff-files-nav-count { color: var(--muted-foreground); font-weight: 400; }
.diff-files-nav ul { list-style: none; margin: 0; padding: 0; }
.diff-files-nav li {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.5rem 0.75rem;
	font-size: 0.75rem;
	border-bottom: 1px solid color-mix(in oklab, var(--border) 50%, transparent);
}
.diff-files-nav li:last-child { border-bottom: none; }
.diff-files-nav li:hover { background: color-mix(in oklab, var(--accent) 40%, transparent); }
.diff-files-nav a { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diff-files-nav a:hover { text-decoration: underline; }
/* Plain-PR description prose — a PR body's own markdown, not app-matched
   pixel-for-pixel like the findings/diff UI above, just clean and readable. */
.markdown { font-size: 0.875rem; line-height: 1.6; }
.markdown > *:first-child { margin-top: 0; }
.markdown h1, .markdown h2, .markdown h3, .markdown h4 { font-weight: 600; line-height: 1.3; margin: 1.25rem 0 0.5rem; }
.markdown h1 { font-size: 1.25rem; }
.markdown h2 { font-size: 1.125rem; }
.markdown h3 { font-size: 1rem; }
.markdown h4 { font-size: 0.875rem; }
.markdown p { margin: 0.75rem 0; }
.markdown ul, .markdown ol { margin: 0.75rem 0; padding-left: 1.5rem; }
.markdown li { margin: 0.25rem 0; }
.markdown blockquote { margin: 0.75rem 0; padding: 0 0 0 0.75rem; border-left: 3px solid var(--border); color: var(--muted-foreground); }
.markdown code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 0.8125rem; background: color-mix(in oklab, var(--muted) 60%, transparent); border-radius: 4px; padding: 0.0625rem 0.3125rem; }
.markdown pre { margin: 0.75rem 0; padding: 0.75rem; overflow-x: auto; background: color-mix(in oklab, var(--muted) 35%, transparent); border: 1px solid color-mix(in oklab, var(--border) 70%, transparent); border-radius: 8px; }
.markdown pre code { background: none; padding: 0; }
.markdown a { color: var(--foreground); text-decoration: underline; text-underline-offset: 2px; }
.markdown hr { border: none; border-top: 1px solid var(--border); margin: 1.25rem 0; }
.markdown img, .markdown picture { max-width: 100%; height: auto; }
.markdown .task-list-item { list-style: none; margin-left: -1.25rem; }
.markdown .task-list-item input { margin-right: 0.375rem; vertical-align: middle; }
.markdown details { margin: 0.75rem 0; border: 1px solid color-mix(in oklab, var(--border) 70%, transparent); border-radius: 8px; padding: 0.5rem 0.75rem; }
.markdown summary { cursor: pointer; font-weight: 500; }
.markdown details[open] summary { margin-bottom: 0.5rem; }
.markdown table { border-collapse: collapse; margin: 0.75rem 0; font-size: 0.8125rem; }
.markdown th, .markdown td { border: 1px solid color-mix(in oklab, var(--border) 70%, transparent); padding: 0.375rem 0.625rem; text-align: left; }
.markdown th { background: color-mix(in oklab, var(--muted) 35%, transparent); font-weight: 600; }
/* Same copy and styling as the real Summary tab's empty description. */
.no-description { margin: 0; font-size: 0.875rem; font-style: italic; color: var(--muted-foreground); }
/* Description + checks grid, like the real Summary tab's
   @3xl:grid-cols-[minmax(0,1fr)_20rem] with a sticky aside. */
.summary-grid { display: grid; gap: 2rem; }
@media (min-width: 48rem) {
	.summary-grid { grid-template-columns: minmax(0, 1fr) 20rem; }
	.summary-aside { position: sticky; top: 1rem; align-self: start; }
}
.summary-main { min-width: 0; }
.checks-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	margin-bottom: 0.75rem;
}
.checks-summary { font-size: 0.75rem; line-height: 1rem; color: var(--muted-foreground); }
.check-row {
	display: flex;
	min-width: 0;
	align-items: center;
	gap: 0.5rem;
	margin: 0 -0.5rem;
	border-radius: 8px;
	padding: 0.375rem 0.5rem;
	font-size: 0.75rem;
	line-height: 1rem;
}
a.check-row:hover { background: color-mix(in oklab, var(--accent) 40%, transparent); }
.check-name { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.check-label { flex-shrink: 0; color: var(--muted-foreground); }
.check-row .arrow { color: var(--muted-foreground); }
.check-icon-success { color: var(--icon-clear-fg); }
.check-icon-failure { color: var(--icon-confirmed-fg); }
.check-icon-pending { color: var(--tone-plausible-fg); animation: spin 1s linear infinite; }
.check-icon-skipped, .check-icon-cancelled { color: var(--muted-foreground); }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .check-icon-pending { animation: none; } }
.check-empty {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.75rem 0;
	font-size: 0.75rem;
	line-height: 1rem;
	color: var(--muted-foreground);
}
.comments { margin-top: 2rem; }
.comments-heading { font-size: 0.875rem; line-height: 1.25rem; font-weight: 600; margin: 0 0 0.75rem; }
.comments-count { color: var(--muted-foreground); font-weight: 400; }
.comment {
	border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
	border-radius: 10px;
	background: color-mix(in oklab, var(--muted) 15%, transparent);
	overflow: hidden;
}
.comment + .comment { margin-top: 0.75rem; }
.comment-head {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.625rem 0.75rem;
	border-bottom: 1px solid color-mix(in oklab, var(--border) 50%, transparent);
	font-size: 0.75rem;
	line-height: 1rem;
}
.comment-avatar { width: 20px; height: 20px; border-radius: 9999px; flex-shrink: 0; }
.comment-avatar-fallback { background: color-mix(in oklab, var(--muted) 60%, transparent); }
.comment-author { font-weight: 600; }
.comment-date { color: var(--muted-foreground); }
.comment-body { padding: 0.75rem; }
.comment-body.markdown > *:first-child { margin-top: 0; }
.comment-body.markdown > *:last-child { margin-bottom: 0; }
</style>
</head>
<body>
${
	review.diff
		? `<input type="radio" name="view" id="tab-summary" class="tab-radio" checked>
<input type="radio" name="view" id="tab-code" class="tab-radio">
`
		: ""
}<header>
	<div class="tab-row">
		${tabBarHtml}
	</div>
	<div class="title-row">
		<h1>${titleHtml}</h1>
		${githubButtonHtml}
	</div>
	<div class="meta-row">
		${metaItems.join(META_SEPARATOR)}
	</div>
</header>
${
	review.diff
		? `<div id="panel-summary" class="tab-panel content">${body}</div>
<div id="panel-code" class="tab-panel content">${renderCodeTab(review.diff)}</div>`
		: `<main class="content">${body}</main>`
}
</body>
</html>`;
}
