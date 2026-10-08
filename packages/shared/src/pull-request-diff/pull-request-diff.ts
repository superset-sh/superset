import { z } from "zod";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const revision = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/i) });
const metadataSchema = z.object({
	base: revision,
	head: revision,
	changed_files: count,
	additions: count,
	deletions: count,
});
const pathSchema = z
	.string()
	.min(1)
	.refine(
		(path) =>
			!path.includes("\0") &&
			!path.startsWith("/") &&
			!path.split("/").some((part) => part === "." || part === ".."),
	);
const fileSchema = z.object({
	filename: pathSchema,
	previous_filename: pathSchema.optional(),
	status: z.enum(["added", "removed", "modified", "renamed"]),
	additions: count,
	deletions: count,
	changes: count.optional(),
	patch: z.string().nullable().optional(),
});
export interface PullRequestDiffFile {
	filename: string;
	previousFilename?: string;
	status: "added" | "removed" | "modified" | "renamed";
}
export interface PullRequestDiff {
	patch: string;
	files?: PullRequestDiffFile[];
}

export function isPullRequestDiffTooLarge(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("status" in error && error.status === 406) return true;
	return (
		"message" in error &&
		typeof error.message === "string" &&
		/PullRequest\.diff too_large|diff exceeded the maximum number of lines/i.test(
			error.message,
		)
	);
}

function quotePath(path: string): string {
	const characters = Array.from(path);
	const isControl = (char: string) =>
		char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127;
	if (!characters.some((char) => /[\s"\\]/.test(char) || isControl(char)))
		return path;
	const escaped = characters
		.map((char) => {
			if (char === '"' || char === "\\") return `\\${char}`;
			if (isControl(char))
				return `\\${char.charCodeAt(0).toString(8).padStart(3, "0")}`;
			return char;
		})
		.join("");
	return `"${escaped}"`;
}

function validatePatch(
	patch: string,
	additions: number,
	deletions: number,
): void {
	const lines = patch.split("\n");
	if (lines.at(-1) === "") lines.pop();
	let oldRemaining = 0,
		newRemaining = 0,
		added = 0,
		removed = 0;
	let oldEnd = 0,
		newEnd = 0,
		hunks = 0;
	let canMarkNoNewline = false;
	for (const line of lines) {
		const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(
			line,
		);
		if (header) {
			if (oldRemaining || newRemaining)
				throw new Error("Incomplete GitHub file hunk");
			const oldStart = Number(header[1]),
				oldCount = Number(header[2] ?? 1);
			const newStart = Number(header[3]),
				newCount = Number(header[4] ?? 1);
			if (
				![
					oldStart,
					oldCount,
					newStart,
					newCount,
					oldStart + oldCount,
					newStart + newCount,
				].every(Number.isSafeInteger) ||
				oldStart < oldEnd ||
				newStart < newEnd
			)
				throw new Error("Invalid GitHub file hunk range");
			oldEnd = oldStart + oldCount;
			newEnd = newStart + newCount;
			oldRemaining = oldCount;
			newRemaining = newCount;
			hunks++;
			canMarkNoNewline = false;
		} else if (line === "\\ No newline at end of file") {
			if (!canMarkNoNewline) throw new Error("Invalid GitHub newline marker");
			canMarkNoNewline = false;
		} else {
			if (!hunks) throw new Error("Missing GitHub file hunk header");
			switch (line[0]) {
				case " ":
					oldRemaining--;
					newRemaining--;
					break;
				case "-":
					oldRemaining--;
					removed++;
					break;
				case "+":
					newRemaining--;
					added++;
					break;
				default:
					throw new Error("Invalid GitHub file hunk line");
			}
			if (oldRemaining < 0 || newRemaining < 0)
				throw new Error("Invalid GitHub file hunk length");
			canMarkNoNewline = true;
		}
	}
	if (
		!hunks ||
		oldRemaining ||
		newRemaining ||
		added !== additions ||
		removed !== deletions
	)
		throw new Error("Incomplete GitHub file patch");
}

export async function fetchPullRequestFilesDiff({
	readPullRequest,
	readFiles,
}: {
	readPullRequest: () => Promise<unknown>;
	readFiles: (page: number, perPage: number) => Promise<unknown>;
}): Promise<PullRequestDiff> {
	const before = metadataSchema.parse(await readPullRequest());
	if (before.changed_files > 3000)
		throw new Error("Pull request exceeds GitHub's 3000-file API limit");
	const files: PullRequestDiffFile[] = [],
		sections: string[] = [];
	const names = new Set<string>();
	let additions = 0,
		deletions = 0,
		bytes = 0;
	for (let page = 1; files.length < before.changed_files; page++) {
		const batch = z.array(fileSchema).parse(await readFiles(page, 100));
		if (batch.length !== Math.min(100, before.changed_files - files.length))
			throw new Error("Incomplete GitHub file page");
		for (const file of batch) {
			if (
				names.has(file.filename) ||
				(file.changes !== undefined &&
					file.changes !== file.additions + file.deletions)
			)
				throw new Error("Inconsistent GitHub file metadata");
			names.add(file.filename);
			const renamed = file.status === "renamed";
			if (renamed && !file.previous_filename)
				throw new Error("Missing original GitHub file name");
			const previous = renamed
				? (file.previous_filename as string)
				: file.filename;
			const pureRename =
				renamed && file.additions === 0 && file.deletions === 0;
			if (file.patch) validatePatch(file.patch, file.additions, file.deletions);
			else if (!pureRename)
				throw new Error(`GitHub omitted the patch for ${file.filename}`);
			const headers = [
				`diff --git ${quotePath(`a/${previous}`)} ${quotePath(`b/${file.filename}`)}`,
			];
			if (renamed)
				headers.push(
					`rename from ${quotePath(previous)}`,
					`rename to ${quotePath(file.filename)}`,
				);
			if (file.patch)
				headers.push(
					`--- ${file.status === "added" ? "/dev/null" : quotePath(`a/${previous}`)}`,
					`+++ ${file.status === "removed" ? "/dev/null" : quotePath(`b/${file.filename}`)}`,
					file.patch.replace(/\n$/, ""),
				);
			const section = `${headers.join("\n")}\n`;
			bytes += new TextEncoder().encode(section).byteLength;
			if (bytes > 200 * 1024 * 1024)
				throw new Error("GitHub file patches exceed the diff size limit");
			sections.push(section);
			files.push({
				filename: file.filename,
				status: file.status,
				...(renamed ? { previousFilename: previous } : {}),
			});
			additions += file.additions;
			deletions += file.deletions;
		}
	}
	const after = metadataSchema.parse(await readPullRequest());
	if (
		JSON.stringify(before) !== JSON.stringify(after) ||
		additions !== before.additions ||
		deletions !== before.deletions
	)
		throw new Error(
			"Pull request changed or GitHub returned incomplete file changes",
		);
	return { patch: sections.join(""), files };
}
