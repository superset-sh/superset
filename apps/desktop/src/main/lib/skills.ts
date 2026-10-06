import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	createManagedSkills,
	createUserSkill,
	deleteUserSkill,
	findSkillRoot,
	importUserSkill,
	linkedSkillRoots,
	listUserSkills,
	readSkillMetadata,
	resolveDisabledSkillIds,
	skillRootsUnder,
	type UserSkill,
	type UserSkillScope,
	writableSkillRoot,
	writeSharedDisabledSkillIds,
} from "@superset/agent-setup";
import { getBundledPluginDir } from "@superset/agent-setup/config";
import { projects, type SelectProject, settings } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

export type SkillScope = "system" | UserSkillScope;

export type SkillRef =
	| { kind: "managed"; name: string }
	| { kind: "user"; dir: string };

export interface SkillListItem {
	id: string;
	ref: SkillRef;
	name: string;
	displayName: string;
	description: string;
	shortDescription: string | null;
	scope: SkillScope;
	dir: string;
	displayDir: string;
	path: string;
	linkedFrom: string[];
	enabled: boolean;
	iconDataUri: string | null;
	brandColor: string | null;
}

export interface SkillsListing {
	skills: SkillListItem[];
	personalRoot: string;
	project: { id: string; name: string; skillsRoot: string } | null;
}

export class SkillNotFoundError extends Error {
	constructor(dir: string) {
		super(`No skill at ${dir}`);
		this.name = "SkillNotFoundError";
	}
}

export class SkillProjectError extends Error {
	constructor(projectId: string | undefined) {
		super(
			projectId
				? `Project ${projectId} not found`
				: "A project skill needs a project",
		);
		this.name = "SkillProjectError";
	}
}

const ICON_MIME: Record<string, string> = {
	".svg": "image/svg+xml",
	".png": "image/png",
	".webp": "image/webp",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
};

function displayPath(dir: string): string {
	const home = os.homedir();
	return dir.startsWith(home + path.sep) ? `~${dir.slice(home.length)}` : dir;
}

function readIconDataUri(iconPath: string | null): string | null {
	if (!iconPath) return null;
	const mime = ICON_MIME[path.extname(iconPath).toLowerCase()];
	if (!mime) return null;
	try {
		return `data:${mime};base64,${fs.readFileSync(iconPath).toString("base64")}`;
	} catch {
		return null;
	}
}

const BUNDLED_SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

function bundledSkillsDir(): string {
	return path.join(getBundledPluginDir(), "skills");
}

export function listBundledSkillNames(): string[] {
	const root = bundledSkillsDir();
	try {
		return fs
			.readdirSync(root, { withFileTypes: true })
			.filter(
				(entry) =>
					entry.isDirectory() &&
					fs.existsSync(path.join(root, entry.name, "SKILL.md")),
			)
			.map((entry) => entry.name)
			.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
}

/**
 * Allowlisted against the shipped skill set — the name never touches the
 * filesystem unless it is one of ours.
 */
function resolveBundledSkillDir(name: string): string | null {
	if (!BUNDLED_SKILL_NAME.test(name)) return null;
	if (!listBundledSkillNames().includes(name)) return null;
	return path.join(bundledSkillsDir(), name);
}

function resolveBundledSkillPath(name: string): string | null {
	const dir = resolveBundledSkillDir(name);
	return dir ? path.join(dir, "SKILL.md") : null;
}

/**
 * Raw SKILL.md content (including frontmatter) of a bundled skill, for the
 * editor. Frontmatter must stay in — the markdown view splits/reattaches it
 * around edits, so a stripped read here would delete it on the next save.
 */
export function getBundledSkillContent(name: string): string | null {
	const skillPath = resolveBundledSkillPath(name);
	if (!skillPath) return null;
	try {
		return fs.readFileSync(skillPath, "utf-8");
	} catch {
		return null;
	}
}

/** Absolute path to a bundled skill's SKILL.md, for Open/Reveal in Finder. */
export function getBundledSkillPath(name: string): string | null {
	const skillPath = resolveBundledSkillPath(name);
	if (!skillPath || !fs.existsSync(skillPath)) return null;
	return skillPath;
}

export function getBundledSkillIcons(): Record<string, string> {
	const icons: Record<string, string> = {};
	for (const name of listBundledSkillNames()) {
		const icon = readIconDataUri(
			readSkillMetadata(path.join(bundledSkillsDir(), name))?.iconPath ?? null,
		);
		if (icon) icons[name] = icon;
	}
	return icons;
}

export function getDisabledSkills(): string[] {
	return localDb.select().from(settings).get()?.disabledSkills ?? [];
}

// Serializes the createManagedSkills resyncs triggered by setSkillEnabled and
// writeBundledSkillContent so overlapping calls can't interleave:
// createManagedSkills does multi-await fs work, and without this a second
// call's resync could finish before the first's, leaving disk state
// contradicting whichever write actually happened last.
let managedSkillsSyncQueue: Promise<void> = Promise.resolve();
function queueManagedSkillsSync(disabledSkills: readonly string[]): void {
	managedSkillsSyncQueue = managedSkillsSyncQueue
		.catch(() => {}) // a prior failure must not stall later syncs
		.then(() => createManagedSkills({ disabledSkills }));
}

/**
 * Overwrites a bundled skill's SKILL.md, then re-provisions it out to
 * ~/.agents/skills, the Claude plugin mirror, and the slash-command file —
 * same convention as setSkillEnabled below.
 */
export function writeBundledSkillContent(name: string, content: string): void {
	const skillPath = resolveBundledSkillPath(name);
	if (!skillPath) {
		throw new Error(`Unknown skill: ${name}`);
	}
	fs.writeFileSync(skillPath, content, "utf-8");
	queueManagedSkillsSync(resolveDisabledSkillIds(getDisabledSkills()));
}

/**
 * Toggling re-syncs immediately: disable reaps the skill from every agent
 * (and the Claude plugin mirror), enable rewrites it. Mirrored to the shared
 * disabled-skills file so CLI-launched host-services on this machine honor
 * the choice instead of re-provisioning a skill the user just disabled.
 * Returns null for a name that is not a bundled skill.
 */
export function setSkillEnabled(
	name: string,
	enabled: boolean,
): string[] | null {
	if (!resolveBundledSkillDir(name)) return null;
	const current = new Set(getDisabledSkills());
	if (enabled) {
		current.delete(name);
	} else {
		current.add(name);
	}
	const next = [...current];
	localDb
		.insert(settings)
		.values({ id: 1, disabledSkills: next })
		.onConflictDoUpdate({
			target: settings.id,
			set: { disabledSkills: next },
		})
		.run();
	writeSharedDisabledSkillIds(next);
	// resolveDisabledSkillIds folds in SUPERSET_DISABLED_SKILLS — passing
	// `next` straight through would silently re-enable an env-disabled skill
	// on the next unrelated toggle.
	queueManagedSkillsSync(resolveDisabledSkillIds(next));
	return next;
}

function listSystemSkills(): SkillListItem[] {
	const disabled = new Set(getDisabledSkills());
	return listBundledSkillNames().flatMap((name) => {
		const dir = path.join(bundledSkillsDir(), name);
		const metadata = readSkillMetadata(dir);
		if (!metadata) return [];
		return [
			{
				id: `managed:${name}`,
				ref: { kind: "managed" as const, name },
				name,
				displayName: metadata.displayName,
				description: metadata.description,
				shortDescription: metadata.shortDescription,
				scope: "system" as const,
				dir,
				displayDir: displayPath(dir),
				path: path.join(dir, "SKILL.md"),
				linkedFrom: [],
				enabled: !disabled.has(name),
				iconDataUri: readIconDataUri(metadata.iconPath),
				brandColor: metadata.brandColor,
			},
		];
	});
}

function personalRoots(): string[] {
	return skillRootsUnder(os.homedir());
}

function projectById(projectId: string): SelectProject | null {
	return (
		localDb.select().from(projects).where(eq(projects.id, projectId)).get() ??
		null
	);
}

function scopeBaseDir(scope: UserSkillScope, projectId?: string): string {
	if (scope === "personal") return os.homedir();
	const project = projectId ? projectById(projectId) : null;
	if (!project) throw new SkillProjectError(projectId);
	return project.mainRepoPath;
}

function toListItem(skill: UserSkill): SkillListItem {
	return {
		id: `user:${skill.dir}`,
		ref: { kind: "user", dir: skill.dir },
		name: skill.name,
		displayName: skill.displayName,
		description: skill.description,
		shortDescription: skill.shortDescription,
		scope: skill.scope,
		dir: skill.dir,
		displayDir: displayPath(skill.dir),
		path: skill.skillPath,
		linkedFrom: skill.linkedFrom,
		enabled: true,
		iconDataUri: readIconDataUri(skill.iconPath),
		brandColor: skill.brandColor,
	};
}

export function listSkills(options: { projectId?: string }): SkillsListing {
	const project = options.projectId ? projectById(options.projectId) : null;
	const projectSkills = project
		? listUserSkills(skillRootsUnder(project.mainRepoPath), "project")
		: [];
	const personalSkills = listUserSkills(personalRoots(), "personal");
	return {
		skills: [
			...projectSkills.map(toListItem),
			...personalSkills.map(toListItem),
			...listSystemSkills(),
		],
		personalRoot: writableSkillRoot(os.homedir()),
		project: project
			? {
					id: project.id,
					name: project.name,
					skillsRoot: writableSkillRoot(project.mainRepoPath),
				}
			: null,
	};
}

function matchSkill(skills: UserSkill[], dir: string): UserSkill | null {
	const resolved = path.resolve(dir);
	return (
		skills.find(
			(skill) =>
				path.resolve(skill.dir) === resolved ||
				skill.linkedFrom.some((link) => path.resolve(link) === resolved),
		) ?? null
	);
}

// A path from the renderer reaches the filesystem only if it is a listed skill
// directly under a root of the home dir or a known project.
export function findUserSkill(dir: string): UserSkill | null {
	const personal = personalRoots();
	if (findSkillRoot(dir, personal)) {
		return matchSkill(listUserSkills(personal, "personal"), dir);
	}
	for (const project of localDb.select().from(projects).all()) {
		const roots = skillRootsUnder(project.mainRepoPath);
		if (findSkillRoot(dir, roots)) {
			return matchSkill(listUserSkills(roots, "project"), dir);
		}
	}
	return null;
}

function requireUserSkill(dir: string): UserSkill {
	const skill = findUserSkill(dir);
	if (!skill) throw new SkillNotFoundError(dir);
	return skill;
}

export interface CreateSkillInput {
	scope: UserSkillScope;
	projectId?: string;
	name: string;
	description: string;
}

export function createSkill(input: CreateSkillInput): SkillListItem {
	const base = scopeBaseDir(input.scope, input.projectId);
	const { dir } = createUserSkill({
		rootDir: writableSkillRoot(base),
		name: input.name,
		description: input.description,
		linkRoots: linkedSkillRoots(base),
	});
	return toListItem(requireUserSkill(dir));
}

export interface ImportSkillInput {
	scope: UserSkillScope;
	projectId?: string;
	sourceDir: string;
}

export function importSkill(input: ImportSkillInput): SkillListItem {
	const base = scopeBaseDir(input.scope, input.projectId);
	const { dir } = importUserSkill({
		sourceDir: input.sourceDir,
		rootDir: writableSkillRoot(base),
		linkRoots: linkedSkillRoots(base),
	});
	return toListItem(requireUserSkill(dir));
}

export function deleteSkill(dir: string): void {
	deleteUserSkill(requireUserSkill(dir));
}

export function readSkillContent(ref: SkillRef): {
	content: string | null;
	path: string | null;
} {
	if (ref.kind === "managed") {
		return {
			content: getBundledSkillContent(ref.name),
			path: getBundledSkillPath(ref.name),
		};
	}
	const skill = findUserSkill(ref.dir);
	if (!skill) return { content: null, path: null };
	try {
		return {
			content: fs.readFileSync(skill.skillPath, "utf-8"),
			path: skill.skillPath,
		};
	} catch {
		return { content: null, path: skill.skillPath };
	}
}

export function writeSkillContent(ref: SkillRef, content: string): void {
	if (ref.kind === "managed") {
		writeBundledSkillContent(ref.name, content);
		return;
	}
	fs.writeFileSync(requireUserSkill(ref.dir).skillPath, content, "utf-8");
}
