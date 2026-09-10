import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
	createManagedSkills,
	resolveDisabledSkillIds,
} from "@superset/agent-setup";
import { CLIError } from "@superset/cli-framework";
import {
	assertSafeSegment,
	DEFAULT_MARKETPLACE,
	DEFAULT_MARKETPLACE_REF,
	DEFAULT_MARKETPLACE_REPO,
	findInstalled,
	type InstalledPlugin,
	type KnownMarketplace,
	type MarketplaceSource,
	marketplaceManifest,
	marketplacesDir,
	pluginCachePath,
	readInstalledPlugins,
	readKnownMarketplaces,
	skillsRoot,
	writeInstalledPlugins,
	writeKnownMarketplaces,
} from "./host";
import {
	MARKETPLACE_FILE,
	type MarketplaceEntry,
	releaseTag,
} from "./marketplace";

const git = promisify(execFile);

// Cone mode always keeps top-level files, so the marketplace manifest comes
// along without being named here.
const SPARSE_PATHS = ["plugins"];

/**
 * The manifest is only readable once something is checked out, so the first
 * checkout takes the conventional directory and this widens it to whatever
 * the entries actually name. A marketplace that keeps its plugins elsewhere
 * would otherwise clone to a tree with no plugin.json in it.
 */
function sparsePaths(location: string): string[] {
	const file = path.join(location, MARKETPLACE_FILE);
	if (!fs.existsSync(file)) return SPARSE_PATHS;
	let entries: MarketplaceEntry[];
	try {
		entries =
			(
				JSON.parse(fs.readFileSync(file, "utf8")) as {
					plugins?: MarketplaceEntry[];
				}
			).plugins ?? [];
	} catch {
		return SPARSE_PATHS;
	}
	const dirs = new Set(SPARSE_PATHS);
	for (const entry of entries) {
		if (typeof entry.source !== "string") continue;
		const top = entry.source.replace(/^\.\//, "").split("/")[0];
		if (top && top !== "." && top !== "..") dirs.add(top);
	}
	return [...dirs];
}

export function parseMarketplaceSource(input: string): MarketplaceSource {
	if (input.startsWith(".") || input.startsWith("/") || input.startsWith("~")) {
		return {
			kind: "path",
			path: path.resolve(input.replace(/^~/, process.env.HOME ?? "~")),
		};
	}
	// owner/repo@ref, matching how a ref is named everywhere else. `#branch` is
	// still read so an existing invocation does not break. Only the first
	// separator splits: a ref may itself contain an `@`, as release tags do.
	const split = input.match(/^(.*?)[@#](.*)$/);
	const target = split?.[1] ?? input;
	const ref = split?.[2] || undefined;
	const github = target?.match(
		/^(?:https?:\/\/github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/,
	);
	if (github?.[1]) {
		return { kind: "github", repo: github[1], ...(ref ? { ref } : {}) };
	}
	throw new CLIError(
		`Could not read "${input}" as a marketplace. Use owner/repo, owner/repo@ref, a GitHub URL, or a local path.`,
	);
}

export interface InstallMarketplaceResult {
	name: string;
	source: MarketplaceSource;
	location: string;
	plugins: number;
	updated: boolean;
}

export async function installMarketplace(
	source: MarketplaceSource,
	options: { name?: string } = {},
): Promise<InstallMarketplaceResult> {
	let location: string;
	let updated = false;

	if (source.kind === "path") {
		location = source.path as string;
		if (!fs.existsSync(path.join(location, MARKETPLACE_FILE))) {
			throw new CLIError(`No ${MARKETPLACE_FILE} in ${location}.`);
		}
	} else {
		const repo = source.repo as string;
		const slug = assertSafeSegment(
			options.name ?? repo.split("/")[1] ?? repo.replace("/", "-"),
			"marketplace name",
		);
		location = path.join(marketplacesDir(), slug);

		const ref = source.ref;

		if (fs.existsSync(path.join(location, ".git"))) {
			await git("git", [
				"-C",
				location,
				"fetch",
				"--depth",
				"1",
				"origin",
				ref ?? "HEAD",
			]);
			await git("git", ["-C", location, "reset", "--hard", "FETCH_HEAD"]);
			updated = true;
		} else {
			fs.mkdirSync(path.dirname(location), { recursive: true });
			try {
				// A marketplace is a couple of directories inside a repository that
				// may be enormous — ours is 163 MB and 8,651 files — and this runs
				// inside the desktop's 60s subprocess budget. Fetch no blobs and
				// check out only what a marketplace is made of.
				await git("git", [
					"clone",
					"--depth",
					"1",
					"--filter=blob:none",
					"--sparse",
					"--no-checkout",
					...(ref ? ["--branch", ref] : []),
					`https://github.com/${repo}.git`,
					location,
				]);
				await git("git", [
					"-C",
					location,
					"sparse-checkout",
					"set",
					...SPARSE_PATHS,
				]);
				await git("git", ["-C", location, "checkout"]);
			} catch (error) {
				throw new CLIError(
					`Could not clone ${repo}${ref ? `@${ref}` : ""}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		if (!fs.existsSync(path.join(location, MARKETPLACE_FILE))) {
			throw new CLIError(
				`${repo} has no ${MARKETPLACE_FILE} at its root; it is not a marketplace.`,
			);
		}

		const paths = sparsePaths(location);
		if (paths.length > SPARSE_PATHS.length) {
			await git("git", ["-C", location, "sparse-checkout", "set", ...paths]);
			await git("git", ["-C", location, "checkout"]);
		}
	}

	const manifest = JSON.parse(
		fs.readFileSync(path.join(location, MARKETPLACE_FILE), "utf8"),
	) as { name?: string; plugins?: MarketplaceEntry[] };

	const name = options.name ?? manifest.name;
	if (!name) throw new CLIError(`${MARKETPLACE_FILE} has no name.`);

	const known = readKnownMarketplaces();
	known[name] = {
		source,
		installLocation: location,
		lastUpdated: new Date().toISOString(),
	} satisfies KnownMarketplace;
	writeKnownMarketplaces(known);

	return {
		name,
		source,
		location,
		plugins: manifest.plugins?.length ?? 0,
		updated,
	};
}

export async function ensureDefaultMarketplace(): Promise<void> {
	const known = readKnownMarketplaces();
	if (known[DEFAULT_MARKETPLACE]) return;

	const override = process.env.SUPERSET_DEFAULT_MARKETPLACE_PATH;
	if (override) {
		await installMarketplace(
			{ kind: "path", path: override },
			{ name: DEFAULT_MARKETPLACE },
		);
		return;
	}

	await installMarketplace(
		{
			kind: "github",
			repo: DEFAULT_MARKETPLACE_REPO,
			ref: DEFAULT_MARKETPLACE_REF,
		},
		{ name: DEFAULT_MARKETPLACE },
	);
}

export interface AvailablePlugin {
	marketplace: string;
	entry: MarketplaceEntry;
	installed: boolean;
	installedVersion?: string;
}

export function listAvailable(): AvailablePlugin[] {
	const installed = readInstalledPlugins();
	const out: AvailablePlugin[] = [];
	for (const name of Object.keys(readKnownMarketplaces())) {
		let manifest: ReturnType<typeof marketplaceManifest>;
		try {
			manifest = marketplaceManifest(name);
		} catch {
			continue;
		}
		for (const entry of manifest.plugins ?? []) {
			const match = installed.find(
				(p) => p.name === entry.name && p.marketplace === name,
			);
			out.push({
				marketplace: name,
				entry,
				installed: Boolean(match),
				installedVersion: match?.version,
			});
		}
	}
	return out;
}

function sourceDir(marketplace: string, entry: MarketplaceEntry): string {
	const known = readKnownMarketplaces()[marketplace];
	if (!known)
		throw new CLIError(`Marketplace "${marketplace}" is not installed.`);
	if (typeof entry.source !== "string") {
		throw new CLIError(
			`Plugin "${entry.name}" uses a non-string source, which is not supported.`,
		);
	}
	const root = path.resolve(known.installLocation);
	const dir = path.resolve(root, entry.source);
	const contained = (a: string, b: string) =>
		a === b || a.startsWith(`${b}${path.sep}`);
	const realRoot = fs.existsSync(root) ? fs.realpathSync(root) : root;
	const realDir = fs.existsSync(dir) ? fs.realpathSync(dir) : dir;
	if (!contained(dir, root) || !contained(realDir, realRoot)) {
		throw new CLIError(
			`Plugin "${entry.name}" resolves outside its marketplace.`,
		);
	}
	return dir;
}

/**
 * Writes the plugin's tree at `tag` into `target`, fetching the tag if the
 * shallow clone does not have it yet. Returns false when the marketplace has
 * no such release, so the caller can fall back to the working tree.
 *
 * ls-tree plus show rather than `git archive`: it needs no tar reader, and
 * reading each blob as a Buffer keeps a bundled server byte-identical, which
 * is what its published digest is taken over.
 */
async function extractTag(
	location: string,
	tag: string,
	source: string,
	target: string,
): Promise<boolean> {
	const ref = `refs/tags/${tag}`;
	const has = async () =>
		await git("git", ["-C", location, "rev-parse", "-q", "--verify", ref]).then(
			() => true,
			() => false,
		);

	if (!(await has())) {
		await git("git", [
			"-C",
			location,
			"fetch",
			"--depth",
			"1",
			"origin",
			`${ref}:${ref}`,
		]).catch(() => undefined);
		if (!(await has())) return false;
	}

	const prefix = source.replace(/^\.\//, "").replace(/\/$/, "");
	const listed = await git("git", [
		"-C",
		location,
		"ls-tree",
		"-r",
		"--name-only",
		"-z",
		tag,
		"--",
		prefix,
	]);
	const files = listed.stdout.split("\0").filter(Boolean);
	if (!files.length) return false;
	if (!files.some((file) => path.relative(prefix, file) === "plugin.json")) {
		throw new CLIError(
			`Release ${tag} has no plugin.json at ${prefix}; the tag is not a usable release.`,
		);
	}

	for (const file of files) {
		const relative = path.relative(prefix, file);
		assertSafeRelative(relative, file);
		const destination = path.join(target, relative);
		fs.mkdirSync(path.dirname(destination), { recursive: true });
		const { stdout } = await git(
			"git",
			["-C", location, "show", `${tag}:${file}`],
			{
				encoding: "buffer",
				maxBuffer: 64 * 1024 * 1024,
			},
		);
		fs.writeFileSync(destination, stdout as unknown as Buffer);
	}
	return true;
}

/** A tree entry must stay inside the plugin directory it was listed under. */
function assertSafeRelative(relative: string, file: string): void {
	if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new CLIError(`Refusing to extract "${file}": it escapes the plugin.`);
	}
}

function assertNotSymlink(target: string): void {
	let stat: fs.Stats;
	try {
		stat = fs.lstatSync(target);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
		throw error;
	}
	if (stat.isSymbolicLink()) {
		throw new CLIError(
			`Refusing to copy "${target}": a plugin cannot ship a symlink.`,
		);
	}
}

function copyTree(from: string, to: string): void {
	assertNotSymlink(from);
	fs.mkdirSync(to, { recursive: true });
	for (const item of fs.readdirSync(from, { withFileTypes: true })) {
		const src = path.join(from, item.name);
		const dest = path.join(to, item.name);
		if (item.isSymbolicLink()) {
			throw new CLIError(
				`Refusing to copy "${src}": a plugin cannot ship a symlink.`,
			);
		}
		if (item.isDirectory()) copyTree(src, dest);
		else if (item.isFile()) fs.copyFileSync(src, dest);
	}
}

export interface InstallPluginResult {
	name: string;
	marketplace: string;
	version: string;
	installPath: string;
	skills: number;
}

export interface InstallPluginOptions {
	update?: boolean;
}

export async function installPlugin(
	name: string,
	marketplace?: string,
	options: InstallPluginOptions = {},
): Promise<InstallPluginResult> {
	const candidates = listAvailable().filter(
		(a) =>
			a.entry.name === name && (!marketplace || a.marketplace === marketplace),
	);

	if (candidates.length === 0) {
		throw new CLIError(
			`No plugin "${name}" in any installed marketplace. Run: superset plugins list --available`,
		);
	}
	if (candidates.length > 1) {
		throw new CLIError(
			`"${name}" exists in ${candidates.map((c) => c.marketplace).join(", ")}. Disambiguate with ${name}@<marketplace>.`,
		);
	}

	const found = candidates[0];
	if (!found) throw new CLIError(`No plugin "${name}".`);
	const { entry } = found;
	const dir = sourceDir(found.marketplace, entry);

	const manifestPath = path.join(dir, "plugin.json");
	if (!fs.existsSync(manifestPath)) {
		throw new CLIError(`Plugin "${name}" has no plugin.json.`);
	}

	const existing = readInstalledPlugins().find(
		(p) => p.name === name && p.marketplace === found.marketplace,
	);
	if (existing && !options.update) {
		const available = entry.version ?? "unknown";
		throw new CLIError(
			existing.version === available
				? `"${name}" is already installed at ${existing.version}.`
				: `"${name}" is already installed at ${existing.version}; ${available} is available.`,
			`Run: superset plugins install ${name} --update`,
		);
	}
	assertNotSymlink(manifestPath);
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
		name?: string;
		version?: string;
	};
	if (manifest.name !== name) {
		throw new CLIError(
			`Marketplace "${found.marketplace}" lists "${name}", but its plugin.json declares "${manifest.name ?? "no name"}"; they must match.`,
		);
	}
	if (entry.version && manifest.version && entry.version !== manifest.version) {
		throw new CLIError(
			`Marketplace "${found.marketplace}" lists "${name}" at ${entry.version}, but its plugin.json declares ${manifest.version}; they must match.`,
		);
	}
	const version = assertSafeSegment(
		entry.version ?? manifest.version ?? "",
		"version",
	);

	assertNotSymlink(path.join(dir, "versions"));
	const target = pluginCachePath(found.marketplace, name, version);
	if (fs.existsSync(target)) fs.rmSync(target, { recursive: true });
	fs.mkdirSync(path.dirname(target), { recursive: true });

	// A release is the plugin's tree at its tag. A `path` marketplace is one
	// machine's working tree with no releases in it, so it installs what is
	// there — which is what makes local authoring work.
	const known = readKnownMarketplaces()[found.marketplace];
	const tag = releaseTag(name, version);
	const fromTag =
		known?.source.kind === "github" &&
		(await extractTag(
			path.resolve(known.installLocation),
			tag,
			entry.source,
			target,
		));

	if (!fromTag) {
		fs.mkdirSync(target, { recursive: true });
		const manifestSrc = path.join(dir, "plugin.json");
		if (fs.existsSync(manifestSrc)) {
			fs.copyFileSync(manifestSrc, path.join(target, "plugin.json"));
		}
		for (const item of ["skills", "server"]) {
			const src = path.join(dir, item);
			if (fs.existsSync(src)) copyTree(src, path.join(target, item));
		}
	}

	const plugins = readInstalledPlugins().filter(
		(p) => !(p.name === name && p.marketplace === found.marketplace),
	);
	plugins.push({
		marketplace: found.marketplace,
		name,
		version,
		installPath: target,
		installedAt: new Date().toISOString(),
		enabled: true,
	} satisfies InstalledPlugin);
	writeInstalledPlugins(plugins);

	const skills = (await syncPlugins()).skills;
	return {
		name,
		marketplace: found.marketplace,
		version,
		installPath: target,
		skills,
	};
}

/**
 * Flips a plugin's `enabled` flag on this machine.
 *
 * installed_plugins.json is the only place provisioning reads it from, so a
 * toggle that skips this leaves the skills materialized while the MCP servers
 * are reaped — the plugin ends up half on.
 */
export async function setPluginEnabled(
	name: string,
	enabled: boolean,
	marketplace?: string,
): Promise<InstalledPlugin> {
	const plugins = readInstalledPlugins();
	const match = findInstalled(plugins, name, marketplace);
	if (!match) throw new CLIError(`"${name}" is not installed.`);

	const next = { ...match, enabled };
	writeInstalledPlugins(plugins.map((p) => (p === match ? next : p)));
	await syncPlugins();
	return next;
}

export async function removePlugin(
	name: string,
	marketplace?: string,
): Promise<InstalledPlugin> {
	const plugins = readInstalledPlugins();
	const match = findInstalled(plugins, name, marketplace);
	if (!match) throw new CLIError(`"${name}" is not installed.`);

	writeInstalledPlugins(plugins.filter((p) => p !== match));
	if (fs.existsSync(match.installPath)) {
		fs.rmSync(match.installPath, { recursive: true });
	}
	await syncPlugins();
	return match;
}

export interface SkillEntry {
	plugin: string;
	marketplace: string;
	skill: string;
	directory: string;
	path: string;
	description: string;
}

function readDescription(contents: string): string {
	const match = contents.match(/^description:\s*(.+)$/m);
	return match?.[1]?.trim() ?? "";
}

export interface SyncResult {
	plugins: number;
	skills: number;
	removed: number;
	entries: SkillEntry[];
}

function skillDirNames(): string[] {
	const root = skillsRoot();
	if (!fs.existsSync(root)) return [];
	return fs
		.readdirSync(root, { withFileTypes: true })
		.filter((item) => item.isDirectory())
		.map((item) => item.name);
}

export async function syncPlugins(): Promise<SyncResult> {
	const installed = readInstalledPlugins().filter((p) => p.enabled);
	const before = new Set(skillDirNames());

	await createManagedSkills({
		disabledSkills: resolveDisabledSkillIds(),
	});

	const after = new Set(skillDirNames());
	const entries = listSkills();

	return {
		plugins: installed.length,
		skills: entries.length,
		removed: [...before].filter((dir) => !after.has(dir)).length,
		entries,
	};
}

export function listSkills(): SkillEntry[] {
	const root = skillsRoot();
	const installed = [...readInstalledPlugins()].sort(
		(a, b) => b.name.length - a.name.length,
	);
	const entries: SkillEntry[] = [];

	for (const directory of skillDirNames()) {
		const owner = installed.find((p) => directory.startsWith(`${p.name}-`));
		if (!owner) continue;
		const dir = path.join(root, directory);
		const skillFile = path.join(dir, "SKILL.md");
		if (!fs.existsSync(skillFile)) continue;

		entries.push({
			plugin: owner.name,
			marketplace: owner.marketplace,
			skill: directory.slice(owner.name.length + 1),
			directory,
			path: dir,
			description: readDescription(fs.readFileSync(skillFile, "utf8")),
		});
	}

	return entries.sort((a, b) => a.directory.localeCompare(b.directory));
}
