import { realpath } from "node:fs/promises";
import { join } from "node:path";
import type {
	DefinitionDetail,
	DefinitionKind,
	DefinitionSummary,
} from "@superset/shared/agent-library";
import type { FsService } from "@superset/workspace-fs/core";
import {
	applyDefinitionEdit,
	frontmatterString,
	parseFrontmatter,
	splitFrontmatter,
} from "./frontmatter";

/**
 * Scope-rooted access to Claude Code definition files. All mutations run
 * through an `FsService` rooted at the scope directory, so the workspace-fs
 * confinement (realpath checks, atomic writes, `ifMatch` revisions) applies
 * to every write this module makes.
 */
export interface ScopeRoot {
	scopeKey: string;
	rootPath: string;
	fs: FsService;
	/** Candidate dirs relative to root, precedence order (first wins). */
	agentDirs: string[];
	skillDirs: string[];
}

export class DefinitionStoreError extends Error {
	constructor(
		readonly code:
			| "NOT_FOUND"
			| "ALREADY_EXISTS"
			| "REVISION_CONFLICT"
			| "TOO_LARGE"
			| "INVALID",
		message: string,
		readonly currentRevision?: string,
	) {
		super(message);
	}
}

const MAX_DEFINITION_BYTES = 2 * 1024 * 1024;
const SKILL_FILE = "SKILL.md";

interface CanonicalDir {
	/**
	 * Lexical join of rootPath + relDir. Kept lexical (not realpath-resolved)
	 * because the confined FsService checks containment against the same
	 * rootPath string; realpath is used only to dedupe symlinked candidates
	 * (`.claude/skills` -> `.agents/skills`).
	 */
	absDir: string;
	relDir: string;
}

async function resolveCanonicalDirs(
	root: ScopeRoot,
	kind: DefinitionKind,
): Promise<CanonicalDir[]> {
	const candidates = kind === "agent" ? root.agentDirs : root.skillDirs;
	const seen = new Set<string>();
	const result: CanonicalDir[] = [];
	for (const relDir of candidates) {
		const absDir = join(root.rootPath, relDir);
		let dedupeKey: string;
		try {
			dedupeKey = await realpath(absDir);
		} catch {
			continue; // dir doesn't exist
		}
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		result.push({ absDir, relDir });
	}
	return result;
}

/** Dir new definitions are created in: first existing candidate, else the first candidate. */
async function resolveWriteDir(
	root: ScopeRoot,
	kind: DefinitionKind,
): Promise<CanonicalDir> {
	const existing = await resolveCanonicalDirs(root, kind);
	const first = existing[0];
	if (first) return first;
	const candidates = kind === "agent" ? root.agentDirs : root.skillDirs;
	const relDir = candidates[0];
	if (!relDir) throw new DefinitionStoreError("INVALID", "No candidate dirs");
	return { absDir: join(root.rootPath, relDir), relDir };
}

function definitionFilePath(dir: CanonicalDir, kind: DefinitionKind, name: string) {
	return kind === "agent"
		? join(dir.absDir, `${name}.md`)
		: join(dir.absDir, name, SKILL_FILE);
}

async function readText(
	root: ScopeRoot,
	absolutePath: string,
): Promise<{ content: string; revision: string } | null> {
	try {
		const result = await root.fs.readFile({
			absolutePath,
			encoding: "utf8",
			maxBytes: MAX_DEFINITION_BYTES,
		});
		if (result.kind !== "text") return null;
		if (result.exceededLimit) {
			throw new DefinitionStoreError(
				"TOO_LARGE",
				`Definition file exceeds ${MAX_DEFINITION_BYTES} bytes: ${absolutePath}`,
			);
		}
		return { content: result.content, revision: result.revision };
	} catch (error) {
		if (error instanceof DefinitionStoreError) throw error;
		return null; // missing / unreadable -> treated as absent
	}
}

export async function listDefinitions(
	root: ScopeRoot,
): Promise<DefinitionSummary[]> {
	const summaries: DefinitionSummary[] = [];
	const seen = new Set<string>();

	for (const kind of ["agent", "skill"] as const) {
		for (const dir of await resolveCanonicalDirs(root, kind)) {
			let entries: Awaited<ReturnType<FsService["listDirectory"]>>;
			try {
				entries = await root.fs.listDirectory({ absolutePath: dir.absDir });
			} catch {
				continue;
			}
			for (const entry of entries.entries) {
				const name =
					kind === "agent"
						? entry.kind === "file" && entry.name.endsWith(".md")
							? entry.name.slice(0, -3)
							: null
						: entry.kind === "directory" || entry.kind === "symlink"
							? entry.name
							: null;
				if (!name || name.startsWith(".")) continue;
				const dedupeKey = `${kind}:${name}`;
				if (seen.has(dedupeKey)) continue;

				const filePath = definitionFilePath(dir, kind, name);
				const file = await readText(root, filePath);
				if (!file) continue; // skill dir without SKILL.md, unreadable file, ...
				seen.add(dedupeKey);

				const frontmatter = parseFrontmatter(file.content);
				const metadata = await root.fs.getMetadata({ absolutePath: filePath });
				summaries.push({
					scopeKey: root.scopeKey,
					kind,
					name,
					description: frontmatterString(frontmatter, "description") ?? "",
					model:
						kind === "agent" ? frontmatterString(frontmatter, "model") : null,
					effort:
						kind === "agent" ? frontmatterString(frontmatter, "effort") : null,
					relativePath:
						kind === "agent"
							? join(dir.relDir, `${name}.md`)
							: join(dir.relDir, name, SKILL_FILE),
					updatedAt: metadata?.modifiedAt
						? Date.parse(metadata.modifiedAt)
						: null,
				});
			}
		}
	}

	summaries.sort((a, b) => a.name.localeCompare(b.name));
	return summaries;
}

async function findDefinitionFile(
	root: ScopeRoot,
	kind: DefinitionKind,
	name: string,
): Promise<{
	dir: CanonicalDir;
	filePath: string;
	content: string;
	revision: string;
} | null> {
	for (const dir of await resolveCanonicalDirs(root, kind)) {
		const filePath = definitionFilePath(dir, kind, name);
		const file = await readText(root, filePath);
		if (file) return { dir, filePath, ...file };
	}
	return null;
}

export async function getDefinition(
	root: ScopeRoot,
	kind: DefinitionKind,
	name: string,
): Promise<DefinitionDetail> {
	const found = await findDefinitionFile(root, kind, name);
	if (!found) {
		throw new DefinitionStoreError("NOT_FOUND", `${kind} "${name}" not found`);
	}
	const frontmatter = parseFrontmatter(found.content);
	const { body } = splitFrontmatter(found.content);
	const metadata = await root.fs.getMetadata({ absolutePath: found.filePath });
	return {
		scopeKey: root.scopeKey,
		kind,
		name,
		description: frontmatterString(frontmatter, "description") ?? "",
		model: kind === "agent" ? frontmatterString(frontmatter, "model") : null,
		effort: kind === "agent" ? frontmatterString(frontmatter, "effort") : null,
		relativePath:
			kind === "agent"
				? join(found.dir.relDir, `${name}.md`)
				: join(found.dir.relDir, name, SKILL_FILE),
		updatedAt: metadata?.modifiedAt ? Date.parse(metadata.modifiedAt) : null,
		frontmatter,
		body,
		raw: found.content,
		revision: found.revision,
	};
}

export async function saveDefinition(
	root: ScopeRoot,
	input: {
		kind: DefinitionKind;
		name: string;
		patch?: Record<string, string | null>;
		body?: string;
		raw?: string;
		expectedRevision: string;
	},
): Promise<{ revision: string }> {
	const found = await findDefinitionFile(root, input.kind, input.name);
	if (!found) {
		throw new DefinitionStoreError(
			"NOT_FOUND",
			`${input.kind} "${input.name}" not found`,
		);
	}

	const nextContent =
		input.raw ??
		applyDefinitionEdit({
			raw: found.content,
			patch: input.patch,
			body: input.body,
		});

	const result = await root.fs.writeFile({
		absolutePath: found.filePath,
		content: nextContent,
		options: { create: false, overwrite: true },
		precondition: { ifMatch: input.expectedRevision },
	});
	if (!result.ok) {
		if (result.reason === "conflict") {
			throw new DefinitionStoreError(
				"REVISION_CONFLICT",
				"File changed on disk since it was loaded",
				result.currentRevision,
			);
		}
		throw new DefinitionStoreError("NOT_FOUND", "File disappeared during save");
	}
	return { revision: result.revision };
}

export async function createDefinition(
	root: ScopeRoot,
	input: { kind: DefinitionKind; name: string; description: string },
): Promise<{ revision: string }> {
	const existing = await findDefinitionFile(root, input.kind, input.name);
	if (existing) {
		throw new DefinitionStoreError(
			"ALREADY_EXISTS",
			`${input.kind} "${input.name}" already exists in this scope`,
		);
	}

	const dir = await resolveWriteDir(root, input.kind);
	const filePath = definitionFilePath(dir, input.kind, input.name);
	const parentDir =
		input.kind === "agent" ? dir.absDir : join(dir.absDir, input.name);
	await root.fs.createDirectory({ absolutePath: parentDir, recursive: true });

	const content = `---\nname: ${input.name}\ndescription: ${JSON.stringify(input.description)}\n---\n\n`;
	const result = await root.fs.writeFile({
		absolutePath: filePath,
		content,
		options: { create: true, overwrite: false },
	});
	if (!result.ok) {
		throw new DefinitionStoreError(
			"ALREADY_EXISTS",
			`${input.kind} "${input.name}" already exists in this scope`,
		);
	}
	return { revision: result.revision };
}

export async function removeDefinition(
	root: ScopeRoot,
	input: { kind: DefinitionKind; name: string },
): Promise<void> {
	const found = await findDefinitionFile(root, input.kind, input.name);
	if (!found) {
		throw new DefinitionStoreError(
			"NOT_FOUND",
			`${input.kind} "${input.name}" not found`,
		);
	}
	const target =
		input.kind === "agent" ? found.filePath : join(found.dir.absDir, input.name);
	await root.fs.deletePath({ absolutePath: target, permanent: true });
}

export async function transferDefinition(input: {
	source: ScopeRoot;
	target: ScopeRoot;
	kind: DefinitionKind;
	name: string;
	mode: "copy" | "move";
	overwrite: boolean;
}): Promise<void> {
	const { source, target, kind, name, mode, overwrite } = input;
	if (source.scopeKey === target.scopeKey) {
		throw new DefinitionStoreError(
			"INVALID",
			"Source and target scope are identical",
		);
	}

	const found = await findDefinitionFile(source, kind, name);
	if (!found) {
		throw new DefinitionStoreError("NOT_FOUND", `${kind} "${name}" not found`);
	}

	const targetExisting = await findDefinitionFile(target, kind, name);
	if (targetExisting && !overwrite) {
		throw new DefinitionStoreError(
			"ALREADY_EXISTS",
			`${kind} "${name}" already exists in the target scope`,
		);
	}

	const targetDir = targetExisting
		? targetExisting.dir
		: await resolveWriteDir(target, kind);

	if (kind === "agent") {
		await target.fs.createDirectory({
			absolutePath: targetDir.absDir,
			recursive: true,
		});
		const result = await target.fs.writeFile({
			absolutePath: definitionFilePath(targetDir, "agent", name),
			content: found.content,
			options: { create: true, overwrite: true },
		});
		if (!result.ok) {
			throw new DefinitionStoreError("INVALID", "Failed to write target file");
		}
	} else {
		const sourceSkillDir = join(found.dir.absDir, name);
		const targetSkillDir = join(targetDir.absDir, name);
		if (targetExisting) {
			// Clean replace: a stale asset from the old copy must not survive.
			await target.fs.deletePath({
				absolutePath: targetSkillDir,
				permanent: true,
			});
		}
		await copyDirectory({
			source,
			target,
			sourceDir: sourceSkillDir,
			targetDir: targetSkillDir,
		});
	}

	if (mode === "move") {
		await removeDefinition(source, { kind, name });
	}
}

async function copyDirectory(input: {
	source: ScopeRoot;
	target: ScopeRoot;
	sourceDir: string;
	targetDir: string;
}): Promise<void> {
	const { source, target, sourceDir, targetDir } = input;
	await target.fs.createDirectory({ absolutePath: targetDir, recursive: true });
	const { entries } = await source.fs.listDirectory({
		absolutePath: sourceDir,
	});
	for (const entry of entries) {
		const from = join(sourceDir, entry.name);
		const to = join(targetDir, entry.name);
		if (entry.kind === "directory") {
			await copyDirectory({ source, target, sourceDir: from, targetDir: to });
			continue;
		}
		if (entry.kind !== "file" && entry.kind !== "symlink") continue;
		const file = await source.fs.readFile({
			absolutePath: from,
			maxBytes: MAX_DEFINITION_BYTES,
		});
		if (file.exceededLimit) {
			throw new DefinitionStoreError(
				"TOO_LARGE",
				`Skill asset exceeds ${MAX_DEFINITION_BYTES} bytes: ${from}`,
			);
		}
		await target.fs.writeFile({
			absolutePath: to,
			content: file.content,
			options: { create: true, overwrite: true },
		});
	}
}
