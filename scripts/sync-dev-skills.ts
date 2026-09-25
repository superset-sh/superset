#!/usr/bin/env bun
/**
 * Sync this worktree's `plugins/superset` into a dev-only Claude Code plugin at
 * ~/.claude/skills/superset-dev so you can test in-development skills without
 * colliding with the installed prod `superset@superset` plugin (which owns the
 * name "superset" and takes precedence). Skills load as `/superset-dev:<skill>`.
 *
 * Re-run whenever a skill changes; then `/reload-plugins` in your Claude Code
 * session (a new skill folder is a plugin structural change, not a hot-reload).
 *
 * Usage:  bun run dev:skills   (or: bun scripts/sync-dev-skills.ts)
 */
import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function repoRoot(): string {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			encoding: "utf-8",
		}).trim();
	} catch {
		return process.cwd();
	}
}

const root = repoRoot();
const src = join(root, "plugins", "superset");
if (!existsSync(src)) {
	console.error(`[sync-dev-skills] no plugin at ${src}`);
	process.exit(1);
}

const dest = join(homedir(), ".claude", "skills", "superset-dev");
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });

// Rename the plugin so it doesn't collide with the installed `superset` plugin.
const manifestPath = join(dest, ".claude-plugin", "plugin.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
	name: string;
	description?: string;
};
manifest.name = "superset-dev";
manifest.description = `[DEV] ${manifest.description ?? ""}`.trim();
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);

// Strip any managed sentinel so the desktop app's skill reaper leaves this copy
// alone (it only manages the "superset" dir).
rmSync(join(dest, ".superset-managed"), { force: true });

const skills = readdirSync(join(dest, "skills")).sort();
console.log(
	`[sync-dev-skills] synced ${skills.length} skills to ${dest}\n` +
		`  ${skills.map((s) => `/superset-dev:${s}`).join("  ")}\n` +
		"Run /reload-plugins in your Claude Code session to pick up changes.",
);
