import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MarketplaceContext, ResolvedPlugin } from "./marketplace";
import { checkPlugin, generatedManifestDrift } from "./publish";

let root = "";

function writeJson(file: string, value: unknown): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`);
}

function writeSkill(dir: string, name: string, body: string): void {
	fs.mkdirSync(path.join(dir, "skills", name), { recursive: true });
	fs.writeFileSync(
		path.join(dir, "skills", name, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${body}\n---\n\n${body}\n`,
	);
}

function git(...args: string[]): void {
	execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
}

/**
 * A plugin listed at `version`, in a real repository so the tag checks run
 * against git rather than a stub.
 */
function plugin(
	name: string,
	version: string,
	skills: Record<string, string> = { "file-issue": "File an issue" },
): { ctx: MarketplaceContext; plugin: ResolvedPlugin } {
	const dir = path.join(root, "plugins", name);
	const manifest = {
		name,
		version,
		description: `${name} plugin`,
		extensions: {
			superset: {
				interface: { displayName: name, category: "Productivity" },
				mcp: { type: "streamable-http", url: `https://${name}.test/mcp` },
			},
		},
	};

	writeJson(path.join(dir, "plugin.json"), manifest);
	for (const [skill, body] of Object.entries(skills))
		writeSkill(dir, skill, body);

	const entry = { name, source: `plugins/${name}`, version };
	writeJson(path.join(root, ".agent-marketplace.json"), {
		name: "test",
		plugins: [entry],
	});

	return {
		ctx: {
			root,
			file: path.join(root, ".agent-marketplace.json"),
			marketplace: { name: "test", plugins: [entry] } as never,
		},
		plugin: {
			entry: entry as never,
			dir,
			manifest: manifest as never,
			hasServerSource: false,
			hasSkills: true,
			hasRemoteServer: true,
		},
	};
}

function commitAndTag(tag: string): void {
	git("add", "-A");
	git("-c", "user.email=t@t.test", "-c", "user.name=t", "commit", "-m", tag);
	git("tag", tag);
}

beforeEach(() => {
	root = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "superset-publish-")),
	);
	execFileSync("git", ["-C", root, "init", "-q"], { stdio: "pipe" });
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe("checkPlugin", () => {
	test("a plugin whose tag matches the tree has no problems", async () => {
		const { ctx, plugin: p } = plugin("linear", "1.3.0");
		commitAndTag("linear@1.3.0");

		expect(await checkPlugin(ctx, p)).toEqual([]);
	});

	test("an unreleased version has no tag to compare and is fine", async () => {
		const { ctx, plugin: p } = plugin("linear", "1.3.0");

		expect(await checkPlugin(ctx, p)).toEqual([]);
	});

	// The gap the version folders used to close: editing a skill in place ships
	// a plugin whose released tree no longer matches what the repo says.
	test("catches a skill edited after its version was tagged", async () => {
		const { ctx, plugin: p } = plugin("linear", "1.3.0");
		commitAndTag("linear@1.3.0");
		writeSkill(p.dir, "file-issue", "Rewritten without republishing");

		const [issue] = await checkPlugin(ctx, p);
		expect(issue?.problem).toContain("does not match the working tree");
		expect(issue?.problem).toContain("file-issue");
	});

	test("catches a skill added after its version was tagged", async () => {
		const { ctx, plugin: p } = plugin("linear", "1.3.0");
		commitAndTag("linear@1.3.0");
		writeSkill(p.dir, "duplicate-sweep", "Sweep duplicates");

		expect((await checkPlugin(ctx, p))[0]?.problem).toContain(
			"duplicate-sweep",
		);
	});

	test("catches a marketplace entry left on the old version", async () => {
		const { ctx, plugin: p } = plugin("linear", "1.3.0");
		commitAndTag("linear@1.3.0");
		ctx.marketplace.plugins[0]!.version = "1.2.0";

		expect((await checkPlugin(ctx, p))[0]?.problem).toContain(
			"publish to reconcile",
		);
	});

	test("catches a plugin that serves nothing", async () => {
		const { ctx, plugin: p } = plugin("linear", "1.3.0", {});
		p.hasSkills = false;
		p.hasRemoteServer = false;

		expect((await checkPlugin(ctx, p))[0]?.problem).toContain(
			"no skills, mcp server, or server source",
		);
	});

	test("catches a plugin declaring two servers", async () => {
		const { ctx, plugin: p } = plugin("linear", "1.3.0");
		p.hasServerSource = true;

		const problems = (await checkPlugin(ctx, p)).map((i) => i.problem);
		expect(problems.some((p) => p.includes("exactly one server"))).toBe(true);
	});
});

describe("generatedManifestDrift", () => {
	function sharedPluginsDir(): string {
		const dir = path.join(root, "packages", "shared", "src", "plugins");
		fs.mkdirSync(dir, { recursive: true });
		return dir;
	}

	test("is silent when the repo has no bundle to keep in step", () => {
		const { ctx } = plugin("linear", "1.3.0");
		expect(generatedManifestDrift(ctx)).toEqual([]);
	});

	test("reports a missing bundle", () => {
		const { ctx } = plugin("linear", "1.3.0");
		sharedPluginsDir();

		expect(generatedManifestDrift(ctx)[0]?.problem).toContain("missing");
	});

	test("reports a bundle a publish would rewrite", () => {
		const { ctx } = plugin("linear", "1.3.0");
		fs.writeFileSync(
			path.join(sharedPluginsDir(), "manifests.generated.ts"),
			"export const FIRST_PARTY_MANIFESTS = {} as const;\n",
		);

		expect(generatedManifestDrift(ctx)[0]?.problem).toContain("stale");
	});
});
