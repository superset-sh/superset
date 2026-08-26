import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	removeOwnedFileIfMarked,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { getTemplatePath } from "./config";

export const OMP_EXTENSION_FILE = "superset-hooks.ts";

const OMP_EXTENSION_SIGNATURE = "// Superset Oh My Pi extension";
const OMP_EXTENSION_VERSION = "v1";
export const OMP_EXTENSION_MARKER = `${OMP_EXTENSION_SIGNATURE} ${OMP_EXTENSION_VERSION}`;

/**
 * Returns the global Oh My Pi extensions path used by OMP's auto-discovery.
 *
 * OMP discovers user extensions from `~/.omp/agent/extensions/` by default.
 * `OMP_CODING_AGENT_DIR` overrides that agent directory; we honor it here so a
 * user running OMP with an isolated profile gets Superset's hook in the same
 * extension tree OMP will load. Pi's `PI_CODING_AGENT_DIR` is deliberately
 * ignored: pi and OMP must resolve to distinct extension trees or the two
 * writers fight over one superset-hooks.ts.
 */
export function getOmpExtensionPath(): string {
	const configuredAgentDir = process.env.OMP_CODING_AGENT_DIR;
	const agentDir = configuredAgentDir
		? configuredAgentDir.replace(/^~(?=$|[\\/])/, os.homedir())
		: path.join(os.homedir(), ".omp", "agent");
	return path.join(agentDir, "extensions", OMP_EXTENSION_FILE);
}

/**
 * Renders the Oh My Pi extension content with the marker substituted.
 *
 * The template is environment-independent: it computes the notify.sh path at
 * runtime from `SUPERSET_HOME_DIR` (which is set in every Superset terminal
 * for both dev and prod installs).
 */
export function getOmpExtensionContent(): string {
	const template = fs.readFileSync(
		getTemplatePath("omp-extension.template.ts"),
		"utf-8",
	);
	return template.replace("{{MARKER}}", OMP_EXTENSION_MARKER);
}

/**
 * Writes the Superset-managed Oh My Pi extension into OMP's global extensions
 * directory. Idempotent via `writeFileIfChanged`.
 *
 * OMP auto-discovers extensions in this directory at session start, so no
 * registration step is required. The install is unconditional on whether OMP
 * itself is installed: if the user later installs `omp`, hooks start working
 * with no further setup.
 */
export function createOmpExtension(): void {
	const extensionPath = getOmpExtensionPath();
	const content = getOmpExtensionContent();
	fs.mkdirSync(path.dirname(extensionPath), { recursive: true });
	const changed = writeFileIfChanged(extensionPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Oh My Pi extension`,
	);
}

/** Removes the wholly Superset-owned Oh My Pi extension file (signature-gated). */
export function removeOmpExtension(): void {
	removeOwnedFileIfMarked(
		getOmpExtensionPath(),
		OMP_EXTENSION_SIGNATURE,
		"Oh My Pi extension",
	);
}
