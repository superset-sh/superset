import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeFileIfChanged } from "./agent-wrappers-common";

export const PI_EXTENSION_FILE = "superset-hooks.ts";

const PI_EXTENSION_SIGNATURE = "// Superset pi extension";
const PI_EXTENSION_VERSION = "v1";
export const PI_EXTENSION_MARKER = `${PI_EXTENSION_SIGNATURE} ${PI_EXTENSION_VERSION}`;

const PI_EXTENSION_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"pi-extension.template.ts",
);

/**
 * Returns the global pi extensions directory used by pi's auto-discovery.
 *
 * Decision (see PRD): we install into the user's global `~/.pi/agent/extensions/`
 * rather than an env-scoped Superset-private path. Pi reads
 * `PI_CODING_AGENT_DIR` exclusively when set, so an env-scoped install would
 * shadow user-installed extensions. Cursor-agent is the precedent for
 * "global install, no env override."
 */
export function getPiExtensionPath(): string {
	return path.join(
		os.homedir(),
		".pi",
		"agent",
		"extensions",
		PI_EXTENSION_FILE,
	);
}

/**
 * Renders the pi extension content with the marker substituted.
 *
 * The template is environment-independent: it computes the notify.sh path at
 * runtime from `SUPERSET_HOME_DIR` (which is set in every Superset terminal
 * for both dev and prod installs).
 */
export function getPiExtensionContent(): string {
	const template = fs.readFileSync(PI_EXTENSION_TEMPLATE_PATH, "utf-8");
	return template.replace("{{MARKER}}", PI_EXTENSION_MARKER);
}

/**
 * Opt-out for users who own Start/Stop reporting themselves (e.g. a custom pi
 * extension that adds async subagents and only reports "done" once all of them
 * finish). Setting `SUPERSET_DISABLE_PI_EXTENSION` to a truthy value stops
 * Superset from installing — and, crucially, from regenerating/overwriting —
 * its managed extension, so the user's own extension owns lifecycle reporting.
 *
 * Ordinary pi users leave this unset and get the default integration.
 */
export function isPiExtensionDisabled(): boolean {
	const value = process.env.SUPERSET_DISABLE_PI_EXTENSION?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes";
}

/**
 * Writes the Superset-managed pi extension into the global pi extensions
 * directory. Idempotent via `writeFileIfChanged`.
 *
 * Pi auto-discovers extensions in this directory at session start, so no
 * registration step is required. The install is unconditional on whether
 * pi itself is installed: if the user later installs pi via npm, hooks
 * start working with no further setup.
 *
 * When `SUPERSET_DISABLE_PI_EXTENSION` is set the install is skipped entirely
 * and any existing file is left untouched, so a user-managed extension is not
 * clobbered on the next Superset launch.
 */
export function createPiExtension(): void {
	if (isPiExtensionDisabled()) {
		console.log(
			"[agent-setup] Skipped pi extension (SUPERSET_DISABLE_PI_EXTENSION set)",
		);
		return;
	}
	const extensionPath = getPiExtensionPath();
	const content = getPiExtensionContent();
	fs.mkdirSync(path.dirname(extensionPath), { recursive: true });
	const changed = writeFileIfChanged(extensionPath, content, 0o644);
	console.log(`[agent-setup] ${changed ? "Updated" : "Verified"} pi extension`);
}
