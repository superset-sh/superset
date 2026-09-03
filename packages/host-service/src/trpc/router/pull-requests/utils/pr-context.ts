// Pure helpers behind the `git/prContext` worker task and the create-PR
// prompt: which paths count as generated (kept out of the patch the agent
// reads), how git's log/numstat output parses, how the patch is cut to its
// byte budget, and how the gathered context renders as text. No git here —
// the worker runs the commands and hands their output to these.

export interface PrContextCommit {
	hash: string;
	shortHash: string;
	subject: string;
	body: string;
}

export interface PrContextFile {
	path: string;
	/** Line counts, or null for binary files (git prints `-`). */
	additions: number | null;
	deletions: number | null;
	/** Rename source when git detected one. */
	previousPath?: string;
	generated: boolean;
}

export interface PrContextPatch {
	text: string;
	/** Files whose full diff made it into `text`. */
	includedFiles: number;
	/** Non-generated files left out (or cut short) to stay under budget. */
	omittedFiles: number;
	truncated: boolean;
}

export interface PrContext {
	head: string;
	base: {
		/** Branch name the PR opens against (`branch.<head>.base`, else the repo default). */
		name: string;
		/** The ref the commits and diff were measured from (e.g. `origin/main`). */
		ref: string;
	};
	commits: PrContextCommit[];
	files: PrContextFile[];
	patch: PrContextPatch;
	hasUncommitted: boolean;
	/** Commits not on the upstream; null when the branch has no upstream. */
	unpushedCommits: number | null;
}

/** Bytes of patch the prompt carries. ~30KB keeps the whole dispatch well
 * inside what a TUI agent accepts as one pasted message. */
export const DEFAULT_PATCH_BYTE_BUDGET = 30_000;

/** Past this many pathspec arguments a single `git diff` argv gets unwieldy;
 * the selection flips to the smaller side or gives up on the patch. */
export const MAX_PATHSPEC_ARGS = 400;

const GENERATED_FILE_NAMES = new Set([
	"bun.lock",
	"bun.lockb",
	"package-lock.json",
	"npm-shrinkwrap.json",
	"yarn.lock",
	"pnpm-lock.yaml",
	"Cargo.lock",
	"Gemfile.lock",
	"poetry.lock",
	"Pipfile.lock",
	"uv.lock",
	"composer.lock",
	"go.sum",
	"flake.lock",
	"Package.resolved",
	"Podfile.lock",
	"pubspec.lock",
	"mix.lock",
	"packages.lock.json",
	"Manifest.toml",
]);

const GENERATED_EXTENSIONS = [
	".snap",
	".min.js",
	".min.css",
	".map",
	".po",
	".pot",
	".mo",
	".pb.go",
	".pb.ts",
	".pb.js",
	".g.dart",
	".freezed.dart",
];

/** Directory segments whose contents are build or codegen output. */
const GENERATED_DIR_SEGMENTS = new Set([
	"__generated__",
	"__snapshots__",
	"generated",
	"node_modules",
]);

/**
 * Whether a repo-relative path is generated output the agent should not read
 * to understand a change: lockfiles, translation catalogs (`.po` and the
 * compiled `locales/**` modules), snapshots, minified bundles, ORM migration
 * metadata. Stays deliberately conservative — a false positive hides real
 * work from the description, a false negative only costs patch budget.
 */
export function isGeneratedPath(path: string): boolean {
	const segments = path.split("/");
	const name = segments[segments.length - 1] ?? "";
	if (GENERATED_FILE_NAMES.has(name)) return true;
	if (GENERATED_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
	if (name.includes(".generated.")) return true;
	const dirs = segments.slice(0, -1);
	if (dirs.some((segment) => GENERATED_DIR_SEGMENTS.has(segment))) return true;
	// Compiled Lingui catalogs and any other `locales/<lang>/messages.*`.
	const localesIndex = dirs.indexOf("locales");
	if (localesIndex !== -1 && name.startsWith("messages.")) return true;
	// Drizzle keeps its journal and schema snapshots under drizzle/meta.
	for (let i = 0; i + 1 < dirs.length; i++) {
		if (dirs[i] === "drizzle" && dirs[i + 1] === "meta") return true;
	}
	return false;
}

/** `git log --format=%H%x1f%h%x1f%s%x1f%b%x1e` → commits, newest first. */
export function parseCommitLog(raw: string): PrContextCommit[] {
	const commits: PrContextCommit[] = [];
	for (const record of raw.split("\x1e")) {
		const trimmed = record.replace(/^\n+/, "");
		if (!trimmed.trim()) continue;
		const [hash = "", shortHash = "", subject = "", body = ""] =
			trimmed.split("\x1f");
		commits.push({
			hash: hash.trim(),
			shortHash: shortHash.trim(),
			subject: subject.trim(),
			body: body.trim(),
		});
	}
	return commits;
}

/**
 * `git diff --numstat -z --find-renames` → per-file counts. In `-z` mode a
 * rename's record carries an empty path followed by two NUL-terminated paths
 * (old, new); everything else is `added\tdeleted\tpath`.
 */
export function parseNumstat(raw: string): PrContextFile[] {
	const tokens = raw.split("\0");
	const files: PrContextFile[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) continue;
		const [added = "", deleted = "", inlinePath = ""] = token.split("\t");
		let path = inlinePath;
		let previousPath: string | undefined;
		if (path === "" && i + 2 < tokens.length) {
			previousPath = tokens[i + 1];
			path = tokens[i + 2] ?? "";
			i += 2;
		}
		if (!path) continue;
		const additions = added === "-" ? null : Number.parseInt(added, 10);
		const deletions = deleted === "-" ? null : Number.parseInt(deleted, 10);
		files.push({
			path,
			additions: Number.isFinite(additions) ? additions : null,
			deletions: Number.isFinite(deletions) ? deletions : null,
			...(previousPath ? { previousPath } : {}),
			generated: isGeneratedPath(path),
		});
	}
	return files;
}

/**
 * Pathspec that keeps generated files out of one `git diff` invocation.
 * Excludes are preferred (the include side is usually the long one); when
 * both sides are too long for a sane argv, the patch is skipped rather than
 * risking an E2BIG. `literal` magic so paths with glob characters match
 * themselves.
 */
export function selectPatchPathspec(files: PrContextFile[]): string[] | null {
	const generated = files.filter((file) => file.generated);
	if (generated.length === 0) return ["."];
	const included = files.filter((file) => !file.generated);
	if (included.length === 0) return null;
	if (generated.length <= MAX_PATHSPEC_ARGS) {
		return [
			".",
			...generated.flatMap((file) => [
				`:(exclude,literal)${file.path}`,
				...(file.previousPath
					? [`:(exclude,literal)${file.previousPath}`]
					: []),
			]),
		];
	}
	if (included.length <= MAX_PATHSPEC_ARGS) {
		return included.map((file) => `:(literal)${file.path}`);
	}
	return null;
}

const FILE_SECTION_BOUNDARY = /^(?=diff --git )/m;
const TRUNCATION_MARKER =
	"\n[... diff truncated by Superset to fit the prompt ...]\n";

/**
 * Cuts a `git diff` patch to `budget` bytes at file boundaries so every file
 * the agent sees is complete. Files that don't fit are dropped and counted;
 * only when no whole file fits at all is the first one cut mid-way, so a
 * single-file change larger than the budget still shows its head.
 */
export function slicePatch(
	patch: string,
	budget: number = DEFAULT_PATCH_BYTE_BUDGET,
): PrContextPatch {
	const sections = patch.split(FILE_SECTION_BOUNDARY).filter((s) => s.length);
	let used = 0;
	const kept: string[] = [];
	for (const section of sections) {
		const size = Buffer.byteLength(section, "utf8");
		if (used + size > budget) continue;
		kept.push(section);
		used += size;
	}
	const includedFiles = kept.length;
	const omittedFiles = sections.length - includedFiles;
	const first = sections[0];
	if (includedFiles === 0 && first !== undefined) {
		kept.push(truncateAtLine(first, budget) + TRUNCATION_MARKER);
	}
	return {
		text: kept.join(""),
		includedFiles,
		omittedFiles,
		truncated: omittedFiles > 0,
	};
}

function truncateAtLine(text: string, budget: number): string {
	const head = Buffer.from(text, "utf8").subarray(0, budget).toString("utf8");
	const lastNewline = head.lastIndexOf("\n");
	return lastNewline > 0 ? head.slice(0, lastNewline + 1) : head;
}

function formatCount(value: number | null, sign: "+" | "−"): string {
	return value === null ? "bin" : `${sign}${value}`;
}

function formatBytes(bytes: number): string {
	return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Renders the gathered context as the `<pr-context>` block the agent reads.
 * Plain text and a fenced diff, no markup the agent has to strip.
 */
export function formatPrContext(context: PrContext): string {
	const lines: string[] = [];
	lines.push(`Branch: ${context.head}`);
	lines.push(
		`Base: ${context.base.name} (measured against ${context.base.ref})`,
	);
	lines.push(
		`Uncommitted changes: ${context.hasUncommitted ? "yes — commit them first" : "none"}`,
	);
	lines.push(
		context.unpushedCommits === null
			? "Upstream: none — the branch is not published yet"
			: context.unpushedCommits === 0
				? "Upstream: in sync"
				: `Upstream: ${context.unpushedCommits} commit${context.unpushedCommits === 1 ? "" : "s"} not pushed yet`,
	);
	lines.push("");

	lines.push(
		`## Commits ahead of ${context.base.name} (${context.commits.length}, newest first)`,
	);
	for (const commit of context.commits) {
		lines.push(`- ${commit.shortHash} ${commit.subject}`);
		if (commit.body) {
			for (const bodyLine of commit.body.split("\n")) {
				lines.push(`  ${bodyLine}`);
			}
		}
	}
	lines.push("");

	const generated = context.files.filter((file) => file.generated);
	const additions = context.files.reduce((n, f) => n + (f.additions ?? 0), 0);
	const deletions = context.files.reduce((n, f) => n + (f.deletions ?? 0), 0);
	const generatedNote =
		generated.length > 0
			? `; ${generated.length} generated file${generated.length === 1 ? "" : "s"} marked [generated] and left out of the patch`
			: "";
	lines.push(
		`## Files changed (${context.files.length}, +${additions} −${deletions}${generatedNote})`,
	);
	for (const file of context.files) {
		const rename = file.previousPath
			? ` (renamed from ${file.previousPath})`
			: "";
		const tag = file.generated ? " [generated]" : "";
		lines.push(
			`- ${file.path}${rename}  ${formatCount(file.additions, "+")} ${formatCount(file.deletions, "−")}${tag}`,
		);
	}
	lines.push("");

	const { patch } = context;
	const total = patch.includedFiles + patch.omittedFiles;
	if (patch.text.length === 0) {
		lines.push(
			total === 0
				? "## Patch: no non-generated files changed"
				: "## Patch: omitted (too many files to diff in one pass) — read the diff with `git diff <base>...HEAD`",
		);
		return lines.join("\n");
	}
	const coverage =
		patch.omittedFiles > 0
			? `${patch.includedFiles} of ${total} files, ${formatBytes(Buffer.byteLength(patch.text, "utf8"))}; ${patch.omittedFiles} left out to fit — run \`git diff ${context.base.ref}...HEAD -- <path>\` for those`
			: `${patch.includedFiles} file${patch.includedFiles === 1 ? "" : "s"}, ${formatBytes(Buffer.byteLength(patch.text, "utf8"))}`;
	lines.push(`## Patch (${coverage})`);
	lines.push("```diff");
	lines.push(patch.text.replace(/\n$/, ""));
	lines.push("```");
	return lines.join("\n");
}
