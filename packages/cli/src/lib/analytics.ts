import type { ApiClient } from "./api-client";
import { env } from "./env";

export function trackCommandInvoked(input: {
	api: ApiClient;
	commandPath: string[];
	flags: string[];
}): void {
	void input.api.analytics.captureEvent
		.mutate({
			source: "cli",
			event: "cli_command_invoked",
			properties: {
				command: input.commandPath.join(" "),
				flags: input.flags,
				cli_version: env.VERSION,
			},
		})
		.catch(() => {
			// Telemetry is best-effort; never surface failures to the CLI.
		});
}
