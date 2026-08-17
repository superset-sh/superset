import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Templates ship as plain files next to whatever bundle consumes this package
 * (the desktop copies them to dist/main/templates, the CLI to
 * lib/agent-templates), so bundled entry points must tell us where they
 * landed. The package-relative default only holds when running from TS
 * source (bun dev, tests).
 */
let templatesDirOverride: string | undefined;

export function setAgentSetupTemplatesDir(dir: string): void {
	templatesDirOverride = dir;
}

export function getAgentSetupTemplatesDir(): string {
	return (
		templatesDirOverride ??
		path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates")
	);
}

export function getTemplatePath(name: string): string {
	return path.join(getAgentSetupTemplatesDir(), name);
}

/**
 * The repo's Claude Code plugin (skills + commands) is overlaid at
 * templates/plugin by each distribution's copy step. When running from TS
 * source nothing performs that copy, so fall back to the plugin's in-repo
 * location.
 */
export function getBundledPluginDir(): string {
	const bundled = path.join(getAgentSetupTemplatesDir(), "plugin");
	if (fs.existsSync(path.join(bundled, "skills"))) return bundled;
	const repoPlugin = path.join(
		path.dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
		"..",
		"plugins",
		"superset",
	);
	return fs.existsSync(path.join(repoPlugin, "skills")) ? repoPlugin : bundled;
}

/**
 * Default port of the desktop's v1 localhost notifications server, baked into
 * hook scripts as the v1 fallback endpoint. Kept overridable via the same env
 * var the desktop uses so dev workspaces stay isolated.
 */
export function getV1NotificationsPort(): number {
	const parsed = Number(process.env.DESKTOP_NOTIFICATIONS_PORT);
	return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535
		? parsed
		: 51741;
}
