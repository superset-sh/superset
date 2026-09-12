import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { CLIError } from "@superset/cli-framework";
import { buildPlugin, isBuildCurrent, SERVER_ENTRY } from "./build";
import {
	CLIENT_ENV_PATTERN,
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
	rebuilt: boolean;
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

	const build = await buildPlugin(plugin, { force: options.force });
	if (plugin.hasServerSource && !isBuildCurrent(plugin)) {
		throw new CLIError(
			`Build for "${name}" is stale after rebuilding; refusing to publish.`,
		);
	}
	if (
		plugin.hasServerSource &&
		!fs.existsSync(path.join(plugin.dir, SERVER_ENTRY))
	) {
		throw new CLIError(`${name}@${version} is missing ${SERVER_ENTRY}.`);
	}

	entry.version = version;
	writeJson(ctx.file, ctx.marketplace);
	writeGeneratedManifests(ctx);

	return {
		name,
		version,
		tag,
		files: treeFiles(path.join(plugin.dir, "skills")).length + 1,
		rebuilt: build.built,
	};
}

function checkAuth(plugin: ResolvedPlugin): CheckIssue[] {
	const name = plugin.manifest.name;
	const methods = supersetExtension(plugin.manifest)?.auth;
	if (!methods) return [];

	const issues: CheckIssue[] = [];
	if (!Array.isArray(methods)) {
		issues.push({ name, problem: "auth must be a list of methods" });
		return issues;
	}

	const seen = new Set<string>();
	for (const auth of methods) {
		if (seen.has(auth.type)) {
			issues.push({ name, problem: `auth declares ${auth.type} twice` });
		}
		seen.add(auth.type);

		const inputs = new Set((auth.inputs ?? []).map((input) => input.name));

		if (auth.type === "oauth2") {
			if (!auth.authorization_url || !auth.token_url) {
				issues.push({
					name,
					problem: "oauth2 auth needs both authorization_url and token_url",
				});
			}

			const secrets = (auth.inputs ?? []).filter((input) => input.secret);
			if (secrets.length) {
				issues.push({
					name,
					problem: `oauth2 inputs cannot be secret (${secrets.map((i) => i.name).join(", ")}); they travel in the authorize URL`,
				});
			}

			const declared = auth.requires_env ?? [];
			const foreign = declared.filter(
				(variable) => !CLIENT_ENV_PATTERN.test(variable),
			);
			if (foreign.length) {
				issues.push({
					name,
					problem: `requires_env may only name PLUGIN_<SERVICE>_CLIENT_ID and PLUGIN_<SERVICE>_CLIENT_SECRET; found ${foreign.join(", ")}`,
				});
			}
			if (!declared.some((variable) => variable.endsWith("_CLIENT_ID"))) {
				issues.push({
					name,
					problem:
						"oauth2 auth must name its client id in requires_env; it is what the host reads to start the flow",
				});
			}
			if (!declared.some((variable) => variable.endsWith("_CLIENT_SECRET"))) {
				issues.push({
					name,
					problem:
						"oauth2 auth must name its client secret in requires_env; it is what the host reads to exchange the code",
				});
			}
		} else if (auth.type === "api_key") {
			const credential = auth.credential_input ?? "api_key";
			if (!inputs.has(credential)) {
				issues.push({
					name,
					problem: `api_key auth names credential_input "${credential}" but no input declares it`,
				});
			}
		} else {
			issues.push({ name, problem: `unknown auth type "${auth.type}"` });
		}

		for (const template of templatedStrings(auth)) {
			for (const reference of template.matchAll(/\$\{inputs\.([\w.-]+)\}/g)) {
				const key = reference[1];
				if (key && !inputs.has(key)) {
					issues.push({
						name,
						problem: `references \${inputs.${key}} but no input declares it`,
					});
				}
			}
		}

		if (auth.identity && !auth.identity.url) {
			issues.push({ name, problem: "identity needs a url" });
		}
		if (auth.identity && !auth.identity.id) {
			issues.push({ name, problem: "identity needs an id path" });
		}
	}

	return issues;
}

function templatedStrings(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.flatMap(templatedStrings);
	if (value && typeof value === "object") {
		return Object.values(value).flatMap(templatedStrings);
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

	if (plugin.hasServerSource && !isBuildCurrent(plugin)) {
		issues.push({
			name,
			problem: `src/ has changed since ${SERVER_ENTRY} was built; run \`superset plugins build ${name}\``,
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

	if (!plugin.hasServerSource && !plugin.hasRemoteServer && !plugin.hasSkills) {
		issues.push({
			name,
			problem: "plugin has no skills, mcp server, or server source",
		});
	}

	if (plugin.hasServerSource && plugin.hasRemoteServer) {
		issues.push({
			name,
			problem:
				"plugin declares both an mcp url and src/index.ts; tools come from exactly one server",
		});
	}

	issues.push(...checkAuth(plugin));
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

/**
 * Where the host downloads a plugin's bundled server from, and what it must
 * hash to. `ref` is the release tag rather than the marketplace's branch, so
 * the bytes are pinned to the version that was published even after the branch
 * moves on. Stamped into the generated bundle, never into the hand-authored
 * plugin.json.
 */
function serverStamp(
	pluginDir: string,
	source: string,
	name: string,
	version: string,
): { path: string; integrity: string; ref: string } | null {
	const bundle = path.join(pluginDir, SERVER_ENTRY);
	if (!fs.existsSync(bundle)) return null;

	const digest = createHash("sha256")
		.update(fs.readFileSync(bundle))
		.digest("base64");
	const dir = source.replace(/^\.\//, "").replace(/\/$/, "");
	return {
		path: `${dir}/${SERVER_ENTRY}`,
		integrity: `sha256-${digest}`,
		ref: releaseTag(name, version),
	};
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
		const stamp = serverStamp(pluginDir, entry.source, entry.name, version);
		if (stamp) {
			manifest.extensions ??= {};
			manifest.extensions.superset ??= {};
			manifest.extensions.superset.server = stamp;
		}
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
