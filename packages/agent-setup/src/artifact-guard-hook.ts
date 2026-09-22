import fs from "node:fs";
import path from "node:path";
import { getTemplatePath } from "./config";
import { getHooksDir } from "./paths";
import { writeFileIfChanged } from "./write-file-if-changed";

export const ARTIFACT_GUARD_SCRIPT_NAME = "artifact-guard.sh";
export const ARTIFACT_GUARD_SCRIPT_MARKER = "# Superset artifact guard hook v1";

export function getArtifactGuardScriptPath(): string {
	return path.join(getHooksDir(), ARTIFACT_GUARD_SCRIPT_NAME);
}

export function getArtifactGuardScriptContent(): string {
	const template = fs.readFileSync(
		getTemplatePath("artifact-guard.template.sh"),
		"utf-8",
	);
	return template.replaceAll("{{MARKER}}", ARTIFACT_GUARD_SCRIPT_MARKER);
}

export function createArtifactGuardScript(): void {
	const changed = writeFileIfChanged(
		getArtifactGuardScriptPath(),
		getArtifactGuardScriptContent(),
		0o755,
	);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} artifact guard hook`,
	);
}
