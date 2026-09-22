import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { CLIError } from "@superset/cli-framework";
import { CONNECTOR_SLUGS } from "@superset/shared/connectors";
import { isSupersetHosted } from "@superset/shared/plugins";
import { pluginManifestSchema } from "@superset/shared/plugins/manifest-schema";
import {
	type MarketplaceContext,
	type ResolvedPlugin,
	releaseTag,
	supersetExtension,
	writeJson,
} from "./marketplace";

const run = promisify(execFile);

async function git(root: string, args: string[]): Promise<string | null> {
	try {
		const { stdout } = await run("git", ["-C", root, ...args]);
		return stdout;
	} catch {
		return null;
	}
}

export async function tagExists(root: string, tag: string): Promise<boolean> {
	// `rev-parse -q --verify` exits 1 and says nothing for a ref that is merely
	// absent. Every other failure — not a repository, no git on PATH — would
	// otherwise read as "nothing published yet" and let a publish claim a
	// release it never validated.
	try {
		await run("git", [
			"-C",
			root,
			"rev-parse",
			"-q",
			"--verify",
			`refs/tags/${tag}`,
		]);
		return true;
	} catch (error) {
		const failure = error as { code?: number; stderr?: string };
		if (failure.code === 1 && !failure.stderr?.trim()) return false;
		throw new CLIError(
			`Could not read the tags in ${root}: ${failure.stderr?.trim() || (error instanceof Error ? error.message : String(error))}`,
		);
	}
}

/**
 * Paths under `dir` that differ between the working tree and `tag`.
 *
 * Untracked files are asked for separately: `git diff` compares what git knows
 * about, so a skill added and never committed would otherwise read as a tree
 * that still matches its release.
 */
export async function changedSinceTag(
	root: string,
	tag: string,
	dir: string,
): Promise<string[] | null> {
	const tracked = await git(root, ["diff", "--name-only", tag, "--", dir]);
	if (tracked === null) return null;
	const untracked =
		(await git(root, [
			"ls-files",
			"--others",
			"--exclude-standard",
			"--",
			dir,
		])) ?? "";
	const lines = [...tracked.split("\n"), ...untracked.split("\n")]
		.map((line) => line.trim())
		.filter(Boolean);
	return [...new Set(lines)].sort();
}

export interface PublishResult {
	name: string;
	version: string;
	tag: string;
	files: number;
}

export async function publishPlugin(
	ctx: MarketplaceContext,
	plugin: ResolvedPlugin,
	options: { force?: boolean } = {},
): Promise<PublishResult> {
	const name = plugin.manifest.name;
	const version = plugin.manifest.version;
	if (!version) throw new CLIError(`Plugin "${name}" has no version.`);

	const entry = ctx.marketplace.plugins.find((p) => p.name === name);
	if (!entry) {
		throw new CLIError(`"${name}" is not listed in the marketplace.`);
	}

	const tag = releaseTag(name, version);
	if ((await tagExists(ctx.root, tag)) && !options.force) {
		throw new CLIError(
			`Version ${version} of "${name}" is already tagged as ${tag}. ` +
				`Bump the version (--bump patch) or pass --force to re-stamp it.`,
		);
	}

	entry.version = version;
	writeJson(ctx.file, ctx.marketplace);
	writeGeneratedManifests(ctx);

	return {
		name,
		version,
		tag,
		files: treeFiles(path.join(plugin.dir, "skills")).length + 1,
	};
}

function checkManifest(plugin: ResolvedPlugin): CheckIssue[] {
	const name = plugin.manifest.name;
	const parsed = pluginManifestSchema.safeParse(plugin.manifest);
	if (!parsed.success) {
		return parsed.error.issues.map((issue) => ({
			name,
			problem: `${issue.path.join(".") || "manifest"}: ${issue.message}`,
		}));
	}

	const slug = supersetExtension(plugin.manifest)?.connector?.slug;
	if (
		slug &&
		!CONNECTOR_SLUGS.includes(slug as (typeof CONNECTOR_SLUGS)[number])
	) {
		return [
			{
				name,
				problem: `names connector "${slug}", which is not in the registry (${CONNECTOR_SLUGS.join(", ")})`,
			},
		];
	}
	return [];
}

function treeFiles(dir: string, prefix = ""): string[] {
	if (!fs.existsSync(dir)) return [];
	const files: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue;
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory())
			files.push(...treeFiles(path.join(dir, entry.name), rel));
		else files.push(rel);
	}
	return files.sort();
}

export interface CheckIssue {
	name: string;
	problem: string;
}

export async function checkPlugin(
	ctx: MarketplaceContext,
	plugin: ResolvedPlugin,
	options: { strict?: boolean } = {},
): Promise<CheckIssue[]> {
	const issues: CheckIssue[] = [];
	const name = plugin.manifest.name;
	const version = plugin.manifest.version;

	if (!version) {
		issues.push({ name, problem: "plugin.json has no version" });
		return issues;
	}

	const entry = ctx.marketplace.plugins.find((p) => p.name === name);
	if (entry && entry.version !== version) {
		issues.push({
			name,
			problem: `marketplace records ${entry.version ?? "no version"} but plugin.json says ${version}; publish to reconcile`,
		});
	}

	// A tag is immutable, so a release that exists and no longer matches the
	// tree means the change was never published, not that the tag went stale.
	const tag = releaseTag(name, version);
	const released = await tagExists(ctx.root, tag);
	if (options.strict && !released) {
		issues.push({ name, problem: `${version} has no ${tag} tag yet` });
	}
	if (released) {
		const changed = await changedSinceTag(
			ctx.root,
			tag,
			path.relative(ctx.root, plugin.dir),
		);
		if (changed?.length) {
			issues.push({
				name,
				problem: `${tag} does not match the working tree (${changed.slice(0, 4).join(", ")}${changed.length > 4 ? ", …" : ""}); bump the version and publish`,
			});
		}
	}

	if (!plugin.hasRemoteServer && !plugin.hasSkills && !isSupersetHosted(name)) {
		issues.push({ name, problem: "plugin has no skills and no mcp server" });
	}

	issues.push(...checkManifest(plugin));
	return issues;
}

function publishedSkills(
	pluginDir: string,
): { name: string; description: string }[] {
	const dir = path.join(pluginDir, "skills");
	if (!fs.existsSync(dir)) return [];

	// Sorted by directory name: readdir order is the filesystem's, and it
	// differs between macOS and Linux, so an unsorted list makes the generated
	// bundle a file that only regenerates identically on the OS that wrote it.
	const skills: { name: string; description: string }[] = [];
	const entries = fs
		.readdirSync(dir, { withFileTypes: true })
		.sort((a, b) => a.name.localeCompare(b.name));
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const file = path.join(dir, entry.name, "SKILL.md");
		if (!fs.existsSync(file)) continue;
		const contents = fs.readFileSync(file, "utf8");
		skills.push({
			name: contents.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? entry.name,
			description: contents.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "",
		});
	}
	return skills;
}

const GENERATED_HEADER = `// Generated by \`superset plugins publish\`. Do not edit.
//
// The first-party marketplace's published manifests, bundled so the API can
// resolve a plugin without fetching anything. This is deliberately not
// client-supplied: a manifest drives token_url and the proxy target, so
// trusting one from a request would be an exfiltration path.
`;

export function renderGeneratedManifests(
	ctx: MarketplaceContext,
): { target: string; contents: string } | null {
	const target = path.join(
		ctx.root,
		"packages",
		"shared",
		"src",
		"plugins",
		"manifests.generated.ts",
	);
	if (!fs.existsSync(path.dirname(target))) return null;

	const entries: string[] = [];
	for (const entry of ctx.marketplace.plugins) {
		const version = entry.version;
		if (!version) continue;
		const pluginDir = path.join(ctx.root, entry.source);
		const manifestPath = path.join(pluginDir, "plugin.json");
		if (!fs.existsSync(manifestPath)) continue;
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
		manifest.skills = publishedSkills(pluginDir);
		entries.push(
			`\t${JSON.stringify(entry.name)}: ${JSON.stringify(manifest, null, "\t")
				.split("\n")
				.join("\n\t")} as const,`,
		);
	}

	const contents = `${GENERATED_HEADER}
export const FIRST_PARTY_MANIFESTS = {
${entries.join("\n")}
} as const;

export type FirstPartyPluginName = keyof typeof FIRST_PARTY_MANIFESTS;

export function firstPartyManifest(
	name: string,
): (typeof FIRST_PARTY_MANIFESTS)[FirstPartyPluginName] | null {
	if (!Object.hasOwn(FIRST_PARTY_MANIFESTS, name)) return null;
	return (FIRST_PARTY_MANIFESTS as Record<string, unknown>)[
		name
	] as (typeof FIRST_PARTY_MANIFESTS)[FirstPartyPluginName];
}
`;
	return { target, contents };
}

export function writeGeneratedManifests(
	ctx: MarketplaceContext,
): string | null {
	const rendered = renderGeneratedManifests(ctx);
	if (!rendered) return null;
	fs.writeFileSync(rendered.target, rendered.contents);
	return rendered.target;
}

export function generatedManifestDrift(ctx: MarketplaceContext): CheckIssue[] {
	const rendered = renderGeneratedManifests(ctx);
	if (!rendered) return [];

	const current = fs.existsSync(rendered.target)
		? fs.readFileSync(rendered.target, "utf8")
		: null;
	if (current === rendered.contents) return [];

	return [
		{
			name: path.basename(rendered.target),
			problem:
				current === null
					? "bundled manifests are missing; run `superset plugins publish`"
					: "bundled manifests are stale; run `superset plugins publish` to regenerate",
		},
	];
}
