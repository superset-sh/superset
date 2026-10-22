import { createHash } from "node:crypto";
import { PLUGIN_TREE_ENTRIES } from "@superset/shared/plugins/bundle";

/** Superset's own catalog first, then the Codex and Claude Code locations, so one repository can serve all three. */
export const MARKETPLACE_FILES = [
	".agent-marketplace.json",
	".agents/plugins/marketplace.json",
	".claude-plugin/marketplace.json",
] as const;

const MANIFEST_FILES = [
	"plugin.json",
	".codex-plugin/plugin.json",
	".claude-plugin/plugin.json",
] as const;

export interface MarketplaceEntry {
	name: string;
	dir: string;
	/** What the entry says about the plugin, which stands in for a plugin.json the directory does not have. */
	declared: { name: string; version?: string; description?: string };
}

export interface MarketplaceProblem {
	name: string;
	reason: string;
}

export function joinRepoPath(...parts: string[]): string {
	return parts
		.flatMap((part) => part.split("/"))
		.filter((segment) => segment && segment !== ".")
		.join("/");
}

function localDir(
	base: string,
	source: string,
	pluginRoot: string | undefined,
): string | null {
	const relative = source.startsWith("./")
		? source
		: pluginRoot
			? `${pluginRoot}/${source}`
			: null;
	if (!relative || relative.split("/").includes("..")) return null;
	return joinRepoPath(base, relative);
}

/** The plugins a marketplace file lists, each resolved to a directory in the repository. Only plugins inside the repository can be synced. */
export function parseMarketplace(
	raw: unknown,
	base: string,
): { entries: MarketplaceEntry[]; problems: MarketplaceProblem[] } {
	const catalog = (raw ?? {}) as {
		plugins?: unknown;
		metadata?: { pluginRoot?: unknown };
	};
	if (!Array.isArray(catalog.plugins)) {
		throw new Error("the marketplace file has no plugins list");
	}
	const pluginRoot =
		typeof catalog.metadata?.pluginRoot === "string"
			? catalog.metadata.pluginRoot
			: undefined;

	const entries: MarketplaceEntry[] = [];
	const problems: MarketplaceProblem[] = [];
	for (const item of catalog.plugins as {
		name?: unknown;
		source?: unknown;
		version?: unknown;
		description?: unknown;
	}[]) {
		const name = typeof item?.name === "string" ? item.name : null;
		const text = (value: unknown) =>
			typeof value === "string" && value ? value : undefined;
		if (!name) {
			problems.push({ name: "?", reason: "an entry has no name" });
			continue;
		}
		const source = item.source as
			| string
			| { source?: unknown; path?: unknown }
			| undefined;
		const path =
			typeof source === "string"
				? source
				: source?.source === "local" && typeof source.path === "string"
					? source.path
					: null;
		const dir = path === null ? null : localDir(base, path, pluginRoot);
		if (dir === null) {
			problems.push({
				name,
				reason: "its source is not a directory in this repository",
			});
			continue;
		}
		entries.push({
			name,
			dir,
			declared: {
				name,
				version: text(item.version),
				description: text(item.description),
			},
		});
	}
	return { entries, problems };
}

export function findMarketplaceFile(
	paths: ReadonlySet<string>,
	base: string,
): string | null {
	for (const file of MARKETPLACE_FILES) {
		const path = joinRepoPath(base, file);
		if (paths.has(path)) return path;
	}
	return null;
}

export function findManifestFile(
	paths: ReadonlySet<string>,
	dir: string,
): string | null {
	for (const file of MANIFEST_FILES) {
		const path = joinRepoPath(dir, file);
		if (paths.has(path)) return path;
	}
	return null;
}

/** Repository path to the path it takes in a plugin bundle, for every file a plugin carries besides its manifest. */
export function pluginTreeFiles(
	paths: Iterable<string>,
	dir: string,
): Map<string, string> {
	const prefix = dir ? `${dir}/` : "";
	const out = new Map<string, string>();
	for (const path of paths) {
		if (!path.startsWith(prefix)) continue;
		const relative = path.slice(prefix.length);
		const top = relative.split("/")[0];
		if (
			top !== "plugin.json" &&
			relative.includes("/") &&
			(PLUGIN_TREE_ENTRIES as readonly string[]).includes(top ?? "")
		) {
			out.set(path, relative);
		}
	}
	return out;
}

/** Codex and Claude Code manifests may leave out a version; the content then names it, so an unchanged plugin keeps its version across syncs. */
export function withVersion(
	manifest: Record<string, unknown>,
	files: ReadonlyMap<string, Uint8Array>,
): Record<string, unknown> {
	if (typeof manifest.version === "string" && manifest.version) {
		return manifest;
	}
	const hash = createHash("sha256");
	hash.update(JSON.stringify(manifest));
	for (const [path, data] of [...files].sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		hash.update(path);
		hash.update(data);
	}
	return { ...manifest, version: `0.0.0-${hash.digest("hex").slice(0, 12)}` };
}

/** The skills a plugin carries, named the way its SKILL.md frontmatter names them. */
export function skillsIn(
	files: ReadonlyMap<string, Uint8Array>,
): { name: string; description: string }[] {
	const skills: { name: string; description: string }[] = [];
	for (const [path, data] of files) {
		const match = /^skills\/([^/]+)\/SKILL\.md$/.exec(path);
		if (!match) continue;
		const frontmatter =
			/^---\r?\n([\s\S]*?)\r?\n---/.exec(
				Buffer.from(data).toString("utf8"),
			)?.[1] ?? "";
		const field = (key: string) =>
			new RegExp(`^${key}:\\s*(.*)$`, "m")
				.exec(frontmatter)?.[1]
				?.trim()
				.replace(/^["']|["']$/g, "");
		skills.push({
			name: field("name") || (match[1] as string),
			description: field("description") ?? "",
		});
	}
	return skills.sort((a, b) => a.name.localeCompare(b.name));
}
