import type { DiffHunk, DiffLine, FileDiff } from "../types";

/**
 * Language detection based on file extension
 */
const LANGUAGE_MAP: Record<string, string> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	mjs: "javascript",
	cjs: "javascript",
	json: "json",
	md: "markdown",
	mdx: "mdx",
	css: "css",
	scss: "scss",
	less: "less",
	html: "html",
	xml: "xml",
	svg: "xml",
	yaml: "yaml",
	yml: "yaml",
	toml: "toml",
	py: "python",
	rs: "rust",
	go: "go",
	java: "java",
	kt: "kotlin",
	swift: "swift",
	c: "c",
	cpp: "cpp",
	h: "c",
	hpp: "cpp",
	cs: "csharp",
	rb: "ruby",
	php: "php",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	fish: "fish",
	sql: "sql",
	graphql: "graphql",
	gql: "graphql",
	vue: "vue",
	svelte: "svelte",
	astro: "astro",
	dockerfile: "dockerfile",
	makefile: "makefile",
	cmake: "cmake",
	env: "dotenv",
	gitignore: "gitignore",
};

/**
 * Detect language from file path
 */
export function detectLanguage(filePath: string): string {
	const filename = filePath.split("/").pop() || "";
	const lowerFilename = filename.toLowerCase();

	// Check for special filenames first
	if (lowerFilename === "dockerfile") return "dockerfile";
	if (lowerFilename === "makefile") return "makefile";
	if (lowerFilename.startsWith(".env")) return "dotenv";
	if (lowerFilename === ".gitignore") return "gitignore";

	// Extract extension
	const ext = filename.includes(".")
		? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase()
		: "";

	return LANGUAGE_MAP[ext] || "text";
}

/**
 * Parse raw git diff output into structured FileDiff
 */
export function parseGitDiff(rawDiff: string, filePath: string): FileDiff {
	const lines = rawDiff.split("\n");
	const hunks: DiffHunk[] = [];
	let currentHunk: DiffHunk | null = null;
	let oldLine = 0;
	let newLine = 0;
	let isBinary = false;

	for (const line of lines) {
		// Check for binary file
		if (line.startsWith("Binary files")) {
			isBinary = true;
			continue;
		}

		// Detect hunk header: @@ -oldStart,oldCount +newStart,newCount @@
		const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);

		if (hunkMatch) {
			// Save previous hunk if exists
			if (currentHunk) {
				hunks.push(currentHunk);
			}

			oldLine = Number.parseInt(hunkMatch[1], 10);
			newLine = Number.parseInt(hunkMatch[3], 10);

			currentHunk = {
				header: line,
				oldStart: oldLine,
				oldCount: Number.parseInt(hunkMatch[2] || "1", 10),
				newStart: newLine,
				newCount: Number.parseInt(hunkMatch[4] || "1", 10),
				lines: [],
			};
			continue;
		}

		// Skip if not in a hunk
		if (!currentHunk) continue;

		// Skip diff header lines
		if (line.startsWith("diff --git")) continue;
		if (line.startsWith("index ")) continue;
		if (line.startsWith("---")) continue;
		if (line.startsWith("+++")) continue;
		if (line.startsWith("\\")) continue; // "\ No newline at end of file"

		// Parse diff lines
		let diffLine: DiffLine | null = null;

		if (line.startsWith("+")) {
			diffLine = {
				type: "addition",
				content: line.substring(1),
				oldLineNumber: null,
				newLineNumber: newLine++,
			};
		} else if (line.startsWith("-")) {
			diffLine = {
				type: "deletion",
				content: line.substring(1),
				oldLineNumber: oldLine++,
				newLineNumber: null,
			};
		} else if (line.startsWith(" ") || line === "") {
			// Context line or empty line
			diffLine = {
				type: "context",
				content: line.substring(1),
				oldLineNumber: oldLine++,
				newLineNumber: newLine++,
			};
		}

		if (diffLine) {
			currentHunk.lines.push(diffLine);
		}
	}

	// Don't forget the last hunk
	if (currentHunk) {
		hunks.push(currentHunk);
	}

	return {
		path: filePath,
		isBinary,
		language: detectLanguage(filePath),
		hunks,
	};
}

/**
 * Flatten hunks into a single array of lines for virtualized rendering
 * Includes hunk headers as special lines
 */
export interface FlatDiffLine extends DiffLine {
	/** Whether this is a hunk header */
	isHunkHeader?: boolean;
	/** Hunk header text (if isHunkHeader) */
	hunkHeader?: string;
}

export function flattenDiffHunks(hunks: DiffHunk[]): FlatDiffLine[] {
	const flatLines: FlatDiffLine[] = [];

	for (const hunk of hunks) {
		// Add hunk header as a special line
		flatLines.push({
			type: "context",
			content: hunk.header,
			oldLineNumber: null,
			newLineNumber: null,
			isHunkHeader: true,
			hunkHeader: hunk.header,
		});

		// Add all lines from the hunk
		for (const line of hunk.lines) {
			flatLines.push(line);
		}
	}

	return flatLines;
}
