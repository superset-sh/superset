import fs from "node:fs";
import path from "node:path";
import {
	isValidSkillName,
	slugifySkillName,
	titleCaseSkillName,
} from "@superset/shared/skills";
import {
	MANAGED_SENTINEL_NAME,
	MANAGED_SKILL_MARKER,
	setFrontmatterName,
} from "./managed-skills";

export type UserSkillScope = "project" | "personal";

// Tie-break order for a skill reachable from several dirs: Codex, Vibe and
// Kimi read `.agents` natively, so it wins.
const SKILL_CONFIG_DIRS = [".agents", ".claude", ".codex"] as const;

export function skillRootsUnder(baseDir: string): string[] {
	return SKILL_CONFIG_DIRS.map((dir) => path.join(baseDir, dir, "skills"));
}

export function writableSkillRoot(baseDir: string): string {
	return path.join(baseDir, ".agents", "skills");
}

// Claude Code does not read `.agents/skills`, so new skills are linked from its own dir.
export function linkedSkillRoots(baseDir: string): string[] {
	return [path.join(baseDir, ".claude", "skills")];
}

export interface SkillMetadata {
	displayName: string;
	description: string;
	shortDescription: string | null;
	iconPath: string | null;
	brandColor: string | null;
}

export interface UserSkill extends SkillMetadata {
	name: string;
	scope: UserSkillScope;
	/** May be a symlink. */
	dir: string;
	skillPath: string;
	linkedFrom: string[];
}

export interface SkillFrontmatter {
	name: string | null;
	description: string;
}

export interface SkillInterface {
	displayName: string | null;
	shortDescription: string | null;
	iconSmall: string | null;
	iconLarge: string | null;
	brandColor: string | null;
	defaultPrompt: string | null;
}

export class SkillNameError extends Error {
	constructor(name: string) {
		super(
			`"${name}" is not a valid skill name: use lowercase letters, numbers and single dashes`,
		);
		this.name = "SkillNameError";
	}
}

export class SkillExistsError extends Error {
	constructor(dir: string) {
		super(`A skill already exists at ${dir}`);
		this.name = "SkillExistsError";
	}
}

export class SkillSourceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SkillSourceError";
	}
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length >= 2) {
		if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
			try {
				return JSON.parse(trimmed) as string;
			} catch {
				return trimmed.slice(1, -1);
			}
		}
		if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
			return trimmed.slice(1, -1).replace(/''/g, "'");
		}
	}
	return trimmed;
}

const KEY_LINE = /^([A-Za-z0-9_-]+):(.*)$/;

function indentOf(line: string): number {
	return line.length - line.trimStart().length;
}

function foldBlockScalar(style: string, parts: string[]): string {
	while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
	if (style === "|") return parts.join("\n");
	return parts
		.join("\n")
		.replace(/([^\n])\n(?!\n)/g, "$1 ")
		.replace(/\n\n/g, "\n");
}

// A YAML subset: flat scalars, quoted values and block scalars. Nested
// mappings are skipped, not parsed.
function readScalarMapping(
	lines: readonly string[],
	start: number,
	indent: number,
): Map<string, string> {
	const values = new Map<string, string>();
	let i = start;
	const skipDeeper = () => {
		while (i < lines.length) {
			const next = lines[i] ?? "";
			if (next.trim() !== "" && indentOf(next) <= indent) break;
			i++;
		}
	};
	while (i < lines.length) {
		const line = lines[i] ?? "";
		const content = line.trim();
		if (content === "" || content.startsWith("#")) {
			i++;
			continue;
		}
		const lineIndent = indentOf(line);
		if (lineIndent < indent) break;
		const match = lineIndent === indent ? KEY_LINE.exec(content) : null;
		if (!match) {
			i++;
			continue;
		}
		const key = (match[1] ?? "").toLowerCase();
		const rest = (match[2] ?? "").trim();
		i++;
		const block = /^([|>])[+-]?$/.exec(rest);
		if (block) {
			const parts: string[] = [];
			while (i < lines.length) {
				const next = lines[i] ?? "";
				if (next.trim() !== "" && indentOf(next) <= indent) break;
				parts.push(next.trim() === "" ? "" : next.trim());
				i++;
			}
			values.set(key, foldBlockScalar(block[1] ?? ">", parts));
			continue;
		}
		if (rest === "") {
			skipDeeper();
			continue;
		}
		values.set(key, unquote(rest));
	}
	return values;
}

export function parseSkillFrontmatter(raw: string): SkillFrontmatter {
	const empty: SkillFrontmatter = { name: null, description: "" };
	const lines = raw.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") return empty;
	const end = lines.findIndex(
		(line, index) => index > 0 && line.trim() === "---",
	);
	if (end === -1) return empty;
	const values = readScalarMapping(lines.slice(1, end), 0, 0);
	return {
		name: values.get("name") || null,
		description: values.get("description") ?? "",
	};
}

export function parseSkillInterface(raw: string): SkillInterface {
	const lines = raw.split(/\r?\n/);
	const start = lines.findIndex((line) => /^interface:\s*$/.test(line));
	let values = new Map<string, string>();
	if (start !== -1) {
		const firstChild = lines
			.slice(start + 1)
			.find((line) => line.trim() !== "");
		const indent = firstChild ? indentOf(firstChild) : 0;
		if (indent > 0) values = readScalarMapping(lines, start + 1, indent);
	}
	const get = (key: string) => values.get(key) || null;
	return {
		displayName: get("display_name"),
		shortDescription: get("short_description"),
		iconSmall: get("icon_small"),
		iconLarge: get("icon_large"),
		brandColor: get("brand_color"),
		defaultPrompt: get("default_prompt"),
	};
}

const ICON_FILES = ["icon.svg", "icon.png"] as const;

function resolveIconPath(
	dir: string,
	skillInterface: SkillInterface,
): string | null {
	const candidates = [
		...[skillInterface.iconSmall, skillInterface.iconLarge]
			.filter((value): value is string => value !== null)
			.map((value) => path.resolve(dir, value)),
		...ICON_FILES.map((file) => path.join(dir, file)),
	];
	for (const candidate of candidates) {
		if (!candidate.startsWith(dir + path.sep)) continue;
		try {
			if (fs.statSync(candidate).isFile()) return candidate;
		} catch {
			// not this one
		}
	}
	return null;
}

export function readSkillMetadata(dir: string): SkillMetadata | null {
	let skillMd: string;
	try {
		skillMd = fs.readFileSync(path.join(dir, "SKILL.md"), "utf-8");
	} catch {
		return null;
	}
	return skillMetadataFrom(dir, path.basename(dir), skillMd);
}

function skillMetadataFrom(
	dir: string,
	name: string,
	skillMd: string,
): SkillMetadata {
	let skillInterface = parseSkillInterface("");
	try {
		skillInterface = parseSkillInterface(
			fs.readFileSync(path.join(dir, "agents", "openai.yaml"), "utf-8"),
		);
	} catch {
		// no Codex UI metadata
	}
	return {
		displayName: skillInterface.displayName ?? titleCaseSkillName(name),
		description: parseSkillFrontmatter(skillMd).description,
		shortDescription: skillInterface.shortDescription,
		iconPath: resolveIconPath(dir, skillInterface),
		brandColor: skillInterface.brandColor,
	};
}

function isSupersetManaged(dir: string, skillMd: string): boolean {
	return (
		skillMd.includes(MANAGED_SKILL_MARKER) ||
		fs.existsSync(path.join(dir, MANAGED_SENTINEL_NAME))
	);
}

// Hidden dirs hold Codex's builtins (`.system`); marker-bearing dirs are the
// provisioned copies of bundled skills, listed under System instead.
export function listUserSkills(
	roots: readonly string[],
	scope: UserSkillScope,
): UserSkill[] {
	const byRealPath = new Map<string, UserSkill>();
	for (const root of roots) {
		let names: string[];
		try {
			names = fs.readdirSync(root).sort((a, b) => a.localeCompare(b));
		} catch {
			continue;
		}
		for (const name of names) {
			if (name.startsWith(".")) continue;
			const dir = path.join(root, name);
			const skillPath = path.join(dir, "SKILL.md");
			let realDir: string;
			let skillMd: string;
			try {
				if (!fs.statSync(dir).isDirectory()) continue;
				skillMd = fs.readFileSync(skillPath, "utf-8");
				realDir = fs.realpathSync(dir);
			} catch {
				continue;
			}
			const existing = byRealPath.get(realDir);
			if (existing) {
				existing.linkedFrom.push(dir);
				continue;
			}
			if (isSupersetManaged(dir, skillMd)) continue;
			byRealPath.set(realDir, {
				...skillMetadataFrom(dir, name, skillMd),
				name,
				scope,
				dir,
				skillPath,
				linkedFrom: [],
			});
		}
	}
	return [...byRealPath.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Resolves first, so a `..` segment cannot name a directory outside the roots.
export function findSkillRoot(
	dir: string,
	roots: readonly string[],
): string | null {
	const resolved = path.resolve(dir);
	const name = path.basename(resolved);
	if (name === "" || name.startsWith(".")) return null;
	const parent = path.dirname(resolved);
	return roots.find((root) => path.resolve(root) === parent) ?? null;
}

function yamlScalar(value: string): string {
	return /^[A-Za-z0-9][^#:'"\\]*$/.test(value) && !/\s$/.test(value)
		? value
		: JSON.stringify(value);
}

function entryExists(target: string): boolean {
	try {
		fs.lstatSync(target);
		return true;
	} catch {
		return false;
	}
}

function sameRealPath(a: string, b: string): boolean {
	try {
		return fs.realpathSync(a) === fs.realpathSync(b);
	} catch {
		return false;
	}
}

export function linkSkillFromRoots(
	skillDir: string,
	roots: readonly string[],
): string[] {
	const links: string[] = [];
	for (const root of roots) {
		if (sameRealPath(root, path.dirname(skillDir))) continue;
		const linkPath = path.join(root, path.basename(skillDir));
		if (entryExists(linkPath)) continue;
		fs.mkdirSync(root, { recursive: true });
		fs.symlinkSync(path.relative(root, skillDir), linkPath);
		links.push(linkPath);
	}
	return links;
}

export function renderSkillTemplate(name: string, description: string): string {
	const oneLine = description.replace(/\s+/g, " ").trim();
	return [
		"---",
		`name: ${name}`,
		`description: ${yamlScalar(oneLine)}`,
		"---",
		"",
		`# ${titleCaseSkillName(name)}`,
		"",
		"Write the instructions the agent follows when this skill applies. Be",
		"concrete: the steps to take, the files and tools to use, and what done",
		"looks like. Keep material the agent needs only sometimes in files next",
		"to this one and point at them from here.",
		"",
	].join("\n");
}

export interface CreateUserSkillOptions {
	rootDir: string;
	name: string;
	description: string;
	linkRoots?: readonly string[];
}

export interface WrittenUserSkill {
	dir: string;
	skillPath: string;
	linkedFrom: string[];
}

export function createUserSkill({
	rootDir,
	name,
	description,
	linkRoots = [],
}: CreateUserSkillOptions): WrittenUserSkill {
	if (!isValidSkillName(name)) throw new SkillNameError(name);
	const dir = path.join(rootDir, name);
	if (entryExists(dir)) throw new SkillExistsError(dir);
	fs.mkdirSync(dir, { recursive: true });
	const skillPath = path.join(dir, "SKILL.md");
	fs.writeFileSync(skillPath, renderSkillTemplate(name, description), {
		mode: 0o644,
	});
	return { dir, skillPath, linkedFrom: linkSkillFromRoots(dir, linkRoots) };
}

export interface ImportUserSkillOptions {
	sourceDir: string;
	rootDir: string;
	linkRoots?: readonly string[];
}

export function importUserSkill({
	sourceDir,
	rootDir,
	linkRoots = [],
}: ImportUserSkillOptions): WrittenUserSkill & { name: string } {
	if (!fs.existsSync(path.join(sourceDir, "SKILL.md"))) {
		throw new SkillSourceError(`${sourceDir} has no SKILL.md`);
	}
	const name = slugifySkillName(path.basename(sourceDir));
	if (!isValidSkillName(name)) {
		throw new SkillNameError(path.basename(sourceDir));
	}
	const dir = path.join(rootDir, name);
	if (entryExists(dir)) throw new SkillExistsError(dir);
	fs.mkdirSync(rootDir, { recursive: true });
	fs.cpSync(sourceDir, dir, { recursive: true, dereference: true });
	const skillPath = path.join(dir, "SKILL.md");
	if (name !== path.basename(sourceDir)) {
		fs.writeFileSync(
			skillPath,
			setFrontmatterName(fs.readFileSync(skillPath, "utf-8"), name),
		);
	}
	return {
		dir,
		skillPath,
		name,
		linkedFrom: linkSkillFromRoots(dir, linkRoots),
	};
}

// The real directory goes first, so a link is then removed as a link rather
// than followed into its target.
export function deleteUserSkill(
	skill: Pick<UserSkill, "dir" | "linkedFrom">,
): void {
	const realDir = fs.realpathSync(skill.dir);
	fs.rmSync(realDir, { recursive: true, force: true });
	for (const candidate of [skill.dir, ...skill.linkedFrom]) {
		let stat: fs.Stats;
		try {
			stat = fs.lstatSync(candidate);
		} catch {
			continue;
		}
		if (stat.isSymbolicLink()) fs.unlinkSync(candidate);
	}
}
