import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { CLIError } from "@superset/cli-framework";
import type { ResolvedPlugin } from "./marketplace";

const run = promisify(execFile);

export const SERVER_ENTRY = path.join("server", "index.mjs");
export const SERVER_STAMP = path.join("server", "build-stamp.json");

interface BuildStamp {
	sourceHash: string;
}

export function hashSourceTree(dir: string): string {
	const src = path.join(dir, "src");
	if (!fs.existsSync(src)) return "";

	const files: string[] = [];
	const walk = (current: string) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else files.push(full);
		}
	};
	walk(src);

	const hash = crypto.createHash("sha256");
	for (const file of files.sort()) {
		hash.update(path.relative(src, file));
		hash.update(fs.readFileSync(file));
	}
	return hash.digest("hex");
}

export function readStamp(plugin: ResolvedPlugin): BuildStamp | null {
	const file = path.join(plugin.dir, SERVER_STAMP);
	if (!fs.existsSync(file)) return null;
	try {
		return JSON.parse(fs.readFileSync(file, "utf8")) as BuildStamp;
	} catch {
		return null;
	}
}

export function isBuildCurrent(plugin: ResolvedPlugin): boolean {
	if (!plugin.hasServerSource) return true;
	if (!fs.existsSync(path.join(plugin.dir, SERVER_ENTRY))) return false;
	return readStamp(plugin)?.sourceHash === hashSourceTree(plugin.dir);
}

export function isPublishedBuildCurrent(
	plugin: ResolvedPlugin,
	versionPath: string,
): boolean | null {
	if (!plugin.hasServerSource) return true;
	if (!fs.existsSync(path.join(versionPath, SERVER_ENTRY))) return false;
	const stamp = path.join(versionPath, SERVER_STAMP);
	if (!fs.existsSync(stamp)) return null;
	try {
		const parsed = JSON.parse(fs.readFileSync(stamp, "utf8")) as BuildStamp;
		return parsed.sourceHash === hashSourceTree(plugin.dir);
	} catch {
		return null;
	}
}

export interface BuildResult {
	name: string;
	built: boolean;
	bytes: number;
	reason?: string;
}

export async function buildPlugin(
	plugin: ResolvedPlugin,
	options: { force?: boolean } = {},
): Promise<BuildResult> {
	if (!plugin.hasServerSource) {
		return {
			name: plugin.manifest.name,
			built: false,
			bytes: 0,
			reason: "no src/index.ts",
		};
	}

	const outfile = path.join(plugin.dir, SERVER_ENTRY);
	if (!options.force && isBuildCurrent(plugin)) {
		return {
			name: plugin.manifest.name,
			built: false,
			bytes: fs.statSync(outfile).size,
			reason: "up to date",
		};
	}

	fs.mkdirSync(path.dirname(outfile), { recursive: true });

	try {
		await run(
			"bun",
			[
				"build",
				path.join("src", "index.ts"),
				"--outfile",
				SERVER_ENTRY,
				"--target",
				"node",
				"--format",
				"esm",
			],
			{ cwd: plugin.dir },
		);
	} catch (error) {
		const detail =
			error && typeof error === "object" && "stderr" in error
				? String((error as { stderr: unknown }).stderr)
				: error instanceof Error
					? error.message
					: String(error);
		throw new CLIError(
			`Building ${plugin.manifest.name} failed:\n${detail}\nIs bun on PATH?`,
		);
	}

	if (!fs.existsSync(outfile)) {
		throw new CLIError(
			`Building ${plugin.manifest.name} produced no ${SERVER_ENTRY}.`,
		);
	}

	const stamp: BuildStamp = { sourceHash: hashSourceTree(plugin.dir) };
	fs.writeFileSync(
		path.join(plugin.dir, SERVER_STAMP),
		`${JSON.stringify(stamp, null, "\t")}\n`,
	);

	return {
		name: plugin.manifest.name,
		built: true,
		bytes: fs.statSync(outfile).size,
	};
}
