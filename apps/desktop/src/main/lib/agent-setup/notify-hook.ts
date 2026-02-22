import fs from "node:fs";
import path from "node:path";
import { env } from "shared/env.shared";
import { HOOKS_DIR } from "./paths";

export const NOTIFY_SCRIPT_NAME = "notify.sh";
export const NOTIFY_SCRIPT_MARKER = "# Superset agent notification hook";

const NOTIFY_SCRIPT_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"notify-hook.template.sh",
);

function writeFileIfChanged(
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

export function getNotifyScriptPath(): string {
	return path.join(HOOKS_DIR, NOTIFY_SCRIPT_NAME);
}

export function getNotifyScriptContent(): string {
	const template = fs.readFileSync(NOTIFY_SCRIPT_TEMPLATE_PATH, "utf-8");
	return template
		.replace("{{MARKER}}", NOTIFY_SCRIPT_MARKER)
		.replace("{{DEFAULT_PORT}}", String(env.DESKTOP_NOTIFICATIONS_PORT));
}

export function createNotifyScript(): void {
	const notifyPath = getNotifyScriptPath();
	const script = getNotifyScriptContent();
	const changed = writeFileIfChanged(notifyPath, script, 0o755);
	console.log(`[agent-setup] ${changed ? "Updated" : "Verified"} notify hook`);
}
