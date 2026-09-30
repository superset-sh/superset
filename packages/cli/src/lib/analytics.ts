import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiClient } from "./api-client";
import { SUPERSET_HOME_DIR } from "./config";
import { env } from "./env";

const REPORTED_COMMANDS_PATH = join(
	SUPERSET_HOME_DIR,
	"reported-commands.json",
);

export function isFirstReportToday(
	command: string,
	path = REPORTED_COMMANDS_PATH,
): boolean {
	const day = new Date().toISOString().slice(0, 10);
	let commands: string[] = [];
	try {
		const reported = JSON.parse(readFileSync(path, "utf-8"));
		if (reported?.day === day && Array.isArray(reported.commands)) {
			commands = reported.commands;
		}
	} catch {}
	if (commands.includes(command)) return false;
	try {
		writeFileSync(
			path,
			JSON.stringify({ day, commands: [...commands, command] }),
		);
	} catch {}
	return true;
}

export function trackCommandInvoked(input: {
	api: ApiClient;
	commandPath: string[];
	flags: string[];
}): void {
	const command = input.commandPath.join(" ");
	if (!isFirstReportToday(command)) return;
	void input.api.analytics.captureEvent
		.mutate({
			source: "cli",
			event: "cli_command_invoked",
			properties: {
				command,
				flags: input.flags,
				cli_version: env.VERSION,
			},
		})
		.catch(() => {
			// Telemetry is best-effort; never surface failures to the CLI.
		});
}
