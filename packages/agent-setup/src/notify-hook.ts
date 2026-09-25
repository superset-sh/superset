import fs from "node:fs";
import path from "node:path";
import { getTemplatePath } from "./config";
import { getHooksDir } from "./paths";
import { writeFileIfChanged } from "./write-file-if-changed";

export const NOTIFY_SCRIPT_NAME = "notify.sh";
export const NOTIFY_SCRIPT_MARKER = "# Superset agent notification hook v20";

export function getNotifyScriptPath(): string {
	return path.join(getHooksDir(), NOTIFY_SCRIPT_NAME);
}

export function getNotifyScriptContent(): string {
	const template = fs.readFileSync(
		getTemplatePath("notify-hook.template.sh"),
		"utf-8",
	);
	return template.replaceAll("{{MARKER}}", NOTIFY_SCRIPT_MARKER);
}

export function createNotifyScript(): void {
	const notifyPath = getNotifyScriptPath();
	const script = getNotifyScriptContent();
	const changed = writeFileIfChanged(notifyPath, script, 0o755);
	console.log(`[agent-setup] ${changed ? "Updated" : "Verified"} notify hook`);
}
