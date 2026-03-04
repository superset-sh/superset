import fs from "node:fs";
import path from "node:path";
import { BIN_DIR } from "./paths";

export const WRAPPER_MARKER = "# Superset agent-wrapper v1";
export const SUPERSET_MANAGED_BINARIES = [
	"claude",
	"codex",
	"opencode",
	"gemini",
	"copilot",
	"mastracode",
] as const;

const SUPERSET_MANAGED_HOOK_PATH_PATTERN = /\/\.superset(?:-[^/'"\s\\]+)?\//;
const REAL_BINARY_RESOLVER_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"real-binary-resolver.template.sh",
);

export function writeFileIfChanged(
	filePath: string,
	content: string,
	mode: number,
): boolean {
	const existing = fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf-8")
		: null;
	if (existing === content) {
		try {
			fs.chmodSync(filePath, mode);
		} catch {
			// Best effort.
		}
		return false;
	}

	fs.writeFileSync(filePath, content, { mode });
	return true;
}

export function isSupersetManagedHookCommand(
	command: string | undefined,
	scriptName: string,
): boolean {
	if (!command) return false;
	const normalized = command.replaceAll("\\", "/");
	if (!normalized.includes(`/hooks/${scriptName}`)) return false;
	return SUPERSET_MANAGED_HOOK_PATH_PATTERN.test(normalized);
}

function buildRealBinaryResolver(): string {
	const template = fs.readFileSync(REAL_BINARY_RESOLVER_TEMPLATE_PATH, "utf-8");
	return template.replaceAll("{{BIN_DIR}}", BIN_DIR);
}

function getMissingBinaryMessage(name: string): string {
	return `Superset: ${name} not found in PATH. Install it and ensure it is on PATH, then retry.`;
}

export function getWrapperPath(binaryName: string): string {
	return path.join(BIN_DIR, binaryName);
}

export function buildWrapperScript(
	binaryName: string,
	execLine: string,
): string {
	return `#!/bin/bash
${WRAPPER_MARKER}
# Superset wrapper for ${binaryName}

${buildRealBinaryResolver()}
REAL_BIN=""
REAL_BIN_ROOT=""
if ! resolve_binary_chain "${binaryName}"; then
  echo "${getMissingBinaryMessage(binaryName)}" >&2
  exit 127
fi

${execLine}
`;
}

export function createWrapper(binaryName: string, script: string): void {
	const changed = writeFileIfChanged(getWrapperPath(binaryName), script, 0o755);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} ${binaryName} wrapper`,
	);
}
