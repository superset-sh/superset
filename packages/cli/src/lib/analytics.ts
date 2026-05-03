import { getApiUrl } from "./config";
import { env } from "./env";

const TELEMETRY_PATH = "/api/cli/telemetry";

function authHeaders(bearer: string): Record<string, string> {
	return bearer.startsWith("sk_live_")
		? { "x-api-key": bearer }
		: { Authorization: `Bearer ${bearer}` };
}

export function trackCommandInvoked(input: {
	bearer: string;
	commandPath: string[];
	flags: string[];
}): void {
	const url = `${getApiUrl()}${TELEMETRY_PATH}`;
	void fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...authHeaders(input.bearer),
		},
		body: JSON.stringify({
			event: "cli_command_invoked",
			properties: {
				command: input.commandPath.join(" "),
				flags: input.flags,
				cli_version: env.VERSION,
			},
		}),
	}).catch(() => {
		// Telemetry is best-effort; never surface failures to the CLI.
	});
}
