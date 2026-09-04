import fs from "node:fs";
import { cp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeFileIfChanged } from "./agent-wrappers-common";
import { getBundledPluginDir } from "./config";
import { readInstalledPluginSources } from "./installed-plugins";

export const MANAGED_SKILL_MARKER = "<!-- superset-managed-skill v1 -->";

/**
 * Sentinel file marking a directory as Superset-managed (used for the Claude
 * plugin dir, whose manifest is JSON and can't carry the markdown marker).
 */
export const MANAGED_SENTINEL_NAME = ".superset-managed";

/** Namespace subdirectory for managed commands under ~/.agents/commands. */
export const MANAGED_COMMAND_NAMESPACE = "superset";

/**
 * Claude Code loads any ~/.claude/skills/<name> directory containing a
 * .claude-plugin/plugin.json as a "skills-directory plugin" named
 * `<name>@skills-dir`, namespacing its skills as `<name>:<skill>`. There is
 * exactly one such directory: marketplace plugin skills are grafted into it
 * rather than each claiming a directory of its own, so Claude sees a single
 * Superset plugin however many plugins are installed.
 */
const BUNDLED_SOURCE_NAME = "superset";

/**
 * Skills exposed as slash commands to the in-app chat. Deliberately a curated
 * allowlist (the chat menu shouldn't mirror every skill); everything else in
 * the bundled plugin is provisioned automatically.
 */
const COMMAND_SKILLS = ["feedback", "10x", "setup", "doctor"] as const;

export interface PluginSkillSource {
	name: string;
	dir: string;
}

interface ResolvedSource {
	source: PluginSkillSource;
	skills: string[] | null;
}

interface ExtraTree {
	destRelative: string;
	src: string;
	transform?: (relativePath: string, contents: string) => string;
}

export interface ManagedSkillsOptions {
	homeDir?: string;
	templatesDir?: string;
	disabledSkills?: readonly string[];
	pluginSources?: readonly PluginSkillSource[];
	/** Overrides the ledger path; defaults to the one every provisioner reads. */
	installedPluginsFile?: string;
}

/**
 * Inserts the managed marker right after the frontmatter block so both the
 * writer and the reaper can tell managed files apart from user-authored ones.
 */
export function withManagedMarker(content: string): string {
	if (content.includes(MANAGED_SKILL_MARKER)) return content;
	const frontmatterEnd = content.startsWith("---\n")
		? content.indexOf("\n---\n", 4)
		: -1;
	if (frontmatterEnd === -1) return `${MANAGED_SKILL_MARKER}\n${content}`;
	const insertAt = frontmatterEnd + "\n---\n".length;
	return `${content.slice(0, insertAt)}${MANAGED_SKILL_MARKER}\n${content.slice(insertAt)}`;
}

/** Rewrites the frontmatter `name:` so it matches the destination directory. */
export function setFrontmatterName(content: string, name: string): string {
	if (!content.startsWith("---\n")) return content;
	const frontmatterEnd = content.indexOf("\n---\n", 4);
	if (frontmatterEnd === -1) return content;
	const frontmatter = content.slice(0, frontmatterEnd);
	const rewritten = frontmatter.replace(/^name:[^\n]*$/m, `name: ${name}`);
	return rewritten + content.slice(frontmatterEnd);
}

function isSkillDisabled(
	disabled: ReadonlySet<string>,
	sourceName: string,
	skillName: string,
): boolean {
	if (disabled.has(`${sourceName}/${skillName}`)) return true;
	return sourceName === BUNDLED_SOURCE_NAME && disabled.has(skillName);
}

function resolvePluginSources(
	pluginSources: readonly PluginSkillSource[] = [],
): ResolvedSource[] {
	const seen = new Set([BUNDLED_SOURCE_NAME]);
	const resolved: ResolvedSource[] = [];
	for (const source of pluginSources) {
		if (seen.has(source.name)) {
			console.warn(
				`[agent-setup] Ignoring plugin source "${source.name}": that name is already provisioned`,
			);
			continue;
		}
		seen.add(source.name);
		const skills = listSourceSkills(source.dir);
		if (skills === null) {
			console.warn(
				`[agent-setup] Source for "${source.name}" is unreadable; keeping what it already provisioned`,
			);
		}
		resolved.push({ source, skills });
	}
	return resolved;
}

function isUserOwnedFile(filePath: string): boolean {
	if (!fs.existsSync(filePath)) return false;
	return !fs.readFileSync(filePath, "utf-8").includes(MANAGED_SKILL_MARKER);
}

function isManagedDir(dirPath: string): boolean {
	if (fs.existsSync(path.join(dirPath, MANAGED_SENTINEL_NAME))) return true;
	const skillMd = path.join(dirPath, "SKILL.md");
	return fs.existsSync(skillMd) && !isUserOwnedFile(skillMd);
}

function listFilesRecursive(root: string, relative = ""): string[] {
	const files: string[] = [];
	const absolute = relative ? path.join(root, relative) : root;
	for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
		const entryRelative = relative
			? path.join(relative, entry.name)
			: entry.name;
		if (entry.isDirectory()) {
			files.push(...listFilesRecursive(root, entryRelative));
		} else if (entry.isFile()) {
			files.push(entryRelative);
		}
	}
	return files;
}

/**
 * Mirrors src into dest file-by-file (writeFileIfChanged semantics), removing
 * previously-managed files that no longer exist in src. Files for which
 * `isExcluded` returns true are treated as absent from src — skipped on the
 * way in, and reaped on the way out if a prior sync already wrote them.
 * `extraTrees` grafts directories that live outside src into subpaths of dest;
 * they count as part of src, so the reaper keeps rather than orphans them.
 * `isPreserved` marks paths that are neither written nor reaped — for content
 * whose source is temporarily unreadable and must survive the run.
 */
async function syncDir(
	src: string,
	dest: string,
	isExcluded?: (relativePath: string) => boolean,
	extraTrees: readonly ExtraTree[] = [],
	isPreserved?: (relativePath: string) => boolean,
): Promise<void> {
	const copies: { source: string; relative: string; contents?: string }[] =
		listFilesRecursive(src)
			.filter((file) => !isExcluded?.(file))
			.map((file) => ({ source: path.join(src, file), relative: file }));

	for (const tree of extraTrees) {
		for (const file of listFilesRecursive(tree.src)) {
			const source = path.join(tree.src, file);
			copies.push({
				source,
				relative: path.join(tree.destRelative, file),
				contents: tree.transform?.(file, fs.readFileSync(source, "utf-8")),
			});
		}
	}

	for (const { source, relative, contents } of copies) {
		const target = path.join(dest, relative);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		// Skills may bundle scripts/; keep them runnable after provisioning.
		const executable = (fs.statSync(source).mode & 0o111) !== 0;
		writeFileIfChanged(
			target,
			contents ?? fs.readFileSync(source, "utf-8"),
			executable ? 0o755 : 0o644,
		);
	}
	const wanted = new Set(copies.map((c) => path.join(dest, c.relative)));
	if (fs.existsSync(dest)) {
		for (const file of listFilesRecursive(dest)) {
			const absolute = path.join(dest, file);
			if (file === MANAGED_SENTINEL_NAME || wanted.has(absolute)) continue;
			if (isPreserved?.(file)) continue;
			await rm(absolute);
			let parent = path.dirname(absolute);
			while (
				parent !== dest &&
				fs.existsSync(parent) &&
				fs.readdirSync(parent).length === 0
			) {
				await rm(parent, { recursive: true });
				parent = path.dirname(parent);
			}
		}
	}
}

/**
 * Marketplace plugin skills as directories to graft under the Superset plugin
 * dir's own `skills/`. Claude namespaces by plugin directory, so these answer
 * to `superset:<plugin>-<skill>`; the prefix is what keeps two plugins
 * shipping the same skill name apart, and it matches the directory names used
 * under ~/.agents/skills so a skill is called the same thing everywhere.
 */
function claudeSkillTrees(
	sources: readonly ResolvedSource[],
	disabledSkills: ReadonlySet<string>,
): ExtraTree[] {
	const trees: ExtraTree[] = [];
	for (const { source, skills } of sources) {
		for (const skillName of skills ?? []) {
			if (isSkillDisabled(disabledSkills, source.name, skillName)) continue;
			const dirName = `${source.name}-${skillName}`;
			trees.push({
				destRelative: path.join("skills", dirName),
				src: path.join(source.dir, "skills", skillName),
				transform: (relativePath, contents) =>
					relativePath === "SKILL.md"
						? setFrontmatterName(contents, dirName)
						: contents,
			});
		}
	}
	return trees;
}

/**
 * Provisions the bundled plugin, plus every installed plugin's skills, as one
 * Claude Code skills-directory plugin inside one Claude config dir —
 * `~/.claude` for the default account, or a profile dir whose own `skills/`
 * the user owns (a shared profile links `skills/` at the default account
 * instead, and gets it that way).
 */
async function provisionClaudePlugin(
	bundledPluginDir: string,
	claudeDir: string,
	disabledSkills: ReadonlySet<string>,
	pluginSources: readonly ResolvedSource[],
): Promise<void> {
	const target = path.join(claudeDir, "skills", BUNDLED_SOURCE_NAME);
	const sentinel = path.join(target, MANAGED_SENTINEL_NAME);
	if (fs.existsSync(target) && !fs.existsSync(sentinel)) {
		console.log(`[agent-setup] Skipping user-owned plugin dir at ${target}`);
		return;
	}
	const unreadable = pluginSources
		.filter((entry) => entry.skills === null)
		.map((entry) => ({
			name: entry.source.name,
			prefix: `skills${path.sep}${entry.source.name}-`,
		}));
	await syncDir(
		bundledPluginDir,
		target,
		(relativePath) => {
			const [dir, skillName] = relativePath.split(path.sep);
			return (
				dir === "skills" &&
				isSkillDisabled(disabledSkills, BUNDLED_SOURCE_NAME, skillName ?? "")
			);
		},
		claudeSkillTrees(pluginSources, disabledSkills),
		(relativePath) =>
			unreadable.some(
				(entry) =>
					relativePath.startsWith(entry.prefix) &&
					!isSkillDisabled(
						disabledSkills,
						entry.name,
						relativePath.slice(entry.prefix.length).split(path.sep)[0] ?? "",
					),
			),
	);
	writeFileIfChanged(sentinel, `${MANAGED_SKILL_MARKER}\n`, 0o644);
}

function readPluginSkill(
	sourceDir: string,
	pluginSkill: string,
): string | null {
	const sourcePath = path.join(sourceDir, "skills", pluginSkill, "SKILL.md");
	if (!fs.existsSync(sourcePath)) return null;
	return fs.readFileSync(sourcePath, "utf-8");
}

/**
 * Every skill in a source ships everywhere automatically unless the user
 * disabled it — adding a skill to plugins/superset/skills/ requires no code
 * change here. Returns null on enumeration failure, which the caller must
 * treat as "keep whatever this source already provisioned": an empty desired
 * set would hand every one of its directories to the reaper.
 */
function listSourceSkills(sourceDir: string): string[] | null {
	if (!fs.existsSync(sourceDir)) return null;
	const skillsDir = path.join(sourceDir, "skills");
	if (!fs.existsSync(skillsDir)) return [];
	try {
		return fs
			.readdirSync(skillsDir, { withFileTypes: true })
			.filter(
				(entry) =>
					entry.isDirectory() &&
					fs.existsSync(path.join(skillsDir, entry.name, "SKILL.md")),
			)
			.map((entry) => entry.name);
	} catch (error) {
		console.warn(`[agent-setup] Failed to enumerate ${skillsDir}:`, error);
		return null;
	}
}

/** Copies a bundled skill's extra files (anything besides SKILL.md) verbatim. */
async function copyBundledExtras(
	sourceDir: string,
	targetDir: string,
): Promise<void> {
	for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
		if (entry.name === "SKILL.md") continue;
		await cp(
			path.join(sourceDir, entry.name),
			path.join(targetDir, entry.name),
			{ recursive: true },
		);
	}
}

function provisionedDirsFor(root: string, sourceName: string): string[] {
	if (!fs.existsSync(root)) return [];
	try {
		return fs
			.readdirSync(root, { withFileTypes: true })
			.filter(
				(entry) =>
					entry.isDirectory() && entry.name.startsWith(`${sourceName}-`),
			)
			.map((entry) => entry.name);
	} catch {
		return [];
	}
}

async function reapStaleSkillDirs(
	root: string,
	desiredNames: Set<string>,
): Promise<void> {
	if (!fs.existsSync(root)) return;
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		if (!entry.isDirectory() || desiredNames.has(entry.name)) continue;
		const dirPath = path.join(root, entry.name);
		if (!isManagedDir(dirPath)) continue;
		await rm(dirPath, { recursive: true });
		console.log(`[agent-setup] Reaped stale managed skill ${entry.name}`);
	}
}

async function reapStaleCommands(
	namespaceDir: string,
	desiredFiles: Set<string>,
): Promise<void> {
	if (!fs.existsSync(namespaceDir)) return;
	for (const entry of fs.readdirSync(namespaceDir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		if (desiredFiles.has(entry.name)) continue;
		const filePath = path.join(namespaceDir, entry.name);
		if (isUserOwnedFile(filePath)) continue;
		await rm(filePath);
		console.log(`[agent-setup] Reaped stale managed command ${entry.name}`);
	}
}

export async function createManagedSkills(
	options: ManagedSkillsOptions = {},
): Promise<void> {
	const homeDir = options.homeDir ?? os.homedir();
	const bundledPluginDir = options.templatesDir
		? path.join(options.templatesDir, "plugin")
		: getBundledPluginDir();
	const disabledSkills = new Set(options.disabledSkills ?? []);

	if (!fs.existsSync(path.join(bundledPluginDir, "skills"))) {
		console.warn(
			`[agent-setup] Bundled plugin missing at ${bundledPluginDir}; skipping managed skills`,
		);
		return;
	}

	const agentsSkillsRoot = path.join(homeDir, ".agents", "skills");
	const commandNamespaceDir = path.join(
		homeDir,
		".agents",
		"commands",
		MANAGED_COMMAND_NAMESPACE,
	);

	const installed =
		options.pluginSources ??
		readInstalledPluginSources(options.installedPluginsFile);
	if (installed === null) {
		console.warn(
			"[agent-setup] Skipping skill provisioning and reaping — installed_plugins.json is unreadable",
		);
		return;
	}
	const pluginSources = resolvePluginSources(installed);

	try {
		await provisionClaudePlugin(
			bundledPluginDir,
			path.join(homeDir, ".claude"),
			disabledSkills,
			pluginSources,
		);
	} catch (error) {
		console.warn("[agent-setup] Failed to provision Claude plugin:", error);
	}

	const bundledSkills = listSourceSkills(bundledPluginDir);
	if (bundledSkills === null) {
		console.warn(
			"[agent-setup] Skipping skill provisioning and reaping — bundled plugin unreadable",
		);
		return;
	}

	const desiredAgentsDirs = new Set<string>();
	const sources: ResolvedSource[] = [
		{
			source: { name: BUNDLED_SOURCE_NAME, dir: bundledPluginDir },
			skills: bundledSkills,
		},
		...pluginSources,
	];

	for (const { source, skills } of sources) {
		if (skills === null) {
			for (const existing of provisionedDirsFor(
				agentsSkillsRoot,
				source.name,
			)) {
				const skillName = existing.slice(source.name.length + 1);
				if (isSkillDisabled(disabledSkills, source.name, skillName)) continue;
				desiredAgentsDirs.add(existing);
			}
			continue;
		}

		for (const pluginSkill of skills) {
			if (isSkillDisabled(disabledSkills, source.name, pluginSkill)) continue;
			const dirName = `${source.name}-${pluginSkill}`;
			try {
				const raw = readPluginSkill(source.dir, pluginSkill);
				if (raw === null) continue;
				desiredAgentsDirs.add(dirName);
				const targetDir = path.join(agentsSkillsRoot, dirName);
				const skillMdPath = path.join(targetDir, "SKILL.md");
				if (isUserOwnedFile(skillMdPath)) {
					console.log(
						`[agent-setup] Skipping user-owned skill at ${skillMdPath}`,
					);
					continue;
				}
				fs.mkdirSync(targetDir, { recursive: true });
				writeFileIfChanged(
					skillMdPath,
					withManagedMarker(setFrontmatterName(raw, dirName)),
					0o644,
				);
				await copyBundledExtras(
					path.join(source.dir, "skills", pluginSkill),
					targetDir,
				);
			} catch (error) {
				desiredAgentsDirs.add(dirName);
				console.warn(
					`[agent-setup] Failed to provision skill ${dirName}:`,
					error,
				);
			}
		}
	}

	const desiredCommandFiles = new Set<string>();
	for (const pluginSkill of COMMAND_SKILLS) {
		if (isSkillDisabled(disabledSkills, BUNDLED_SOURCE_NAME, pluginSkill)) {
			continue;
		}
		const fileName = `${pluginSkill}.md`;
		try {
			const raw = readPluginSkill(bundledPluginDir, pluginSkill);
			if (raw === null) continue;
			desiredCommandFiles.add(fileName);
			const filePath = path.join(commandNamespaceDir, fileName);
			if (isUserOwnedFile(filePath)) {
				console.log(`[agent-setup] Skipping user-owned command at ${filePath}`);
				continue;
			}
			fs.mkdirSync(commandNamespaceDir, { recursive: true });
			writeFileIfChanged(filePath, withManagedMarker(raw), 0o644);
		} catch (error) {
			desiredCommandFiles.add(fileName);
			console.warn(
				`[agent-setup] Failed to provision command ${fileName}:`,
				error,
			);
		}
	}

	try {
		// ~/.claude/skills holds only the plugin dir; anything else marker-bearing
		// there (including dirs from earlier versions of this mechanism) is stale.
		await reapStaleSkillDirs(
			path.join(homeDir, ".claude", "skills"),
			new Set([BUNDLED_SOURCE_NAME]),
		);
		await reapStaleSkillDirs(agentsSkillsRoot, desiredAgentsDirs);
		await reapStaleCommands(commandNamespaceDir, desiredCommandFiles);
	} catch (error) {
		console.warn("[agent-setup] Failed to reap stale managed skills:", error);
	}

	console.log("[agent-setup] Managed skills provisioned");
}

/**
 * Provisions the bundled Superset plugin into one Claude config dir. Used for
 * a secondary account whose `skills/` directory the user owns, so it can't be
 * linked at the default account's — the plugin is written into it directly
 * instead of being shared.
 */
export async function provisionManagedClaudePluginAt(
	claudeDir: string,
	options: ManagedSkillsOptions = {},
): Promise<void> {
	const bundledPluginDir = options.templatesDir
		? path.join(options.templatesDir, "plugin")
		: getBundledPluginDir();
	if (!fs.existsSync(path.join(bundledPluginDir, "skills"))) {
		console.warn(
			`[agent-setup] Bundled plugin missing at ${bundledPluginDir}; skipping plugin provisioning for ${claudeDir}`,
		);
		return;
	}
	const installed =
		options.pluginSources ??
		readInstalledPluginSources(options.installedPluginsFile);
	if (installed === null) {
		console.warn(
			`[agent-setup] Skipping plugin provisioning for ${claudeDir} — installed_plugins.json is unreadable`,
		);
		return;
	}
	await provisionClaudePlugin(
		bundledPluginDir,
		claudeDir,
		new Set(options.disabledSkills ?? []),
		resolvePluginSources(installed),
	);
}
